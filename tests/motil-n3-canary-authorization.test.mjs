import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';
import { evaluateMotilOperationalCanaries } from '../lib/intelligence/motil-operational-canaries.mjs';
import { canReviewMaterialAttention } from '../lib/maintenance/material-attention.mjs';

const ORG = 'test-tenant-A';
const NOW = '2026-11-22T18:21:00.000Z';
const source = readFileSync(resolve(process.cwd(), 'app/api/intelligence/maintenance-guardrails/route.ts'), 'utf8');

function harness({
  role = 'tecnico',
  cargoName = 'Mecánico Planta',
  access = 'ED',
  stockAccess = 'LEC',
  workOrders = [],
  failOrders = false,
} = {}) {
  const calls = [];
  const orders = workOrders;
  const sb = {
    from(table) {
      const trace = { table, filters: [], ranged: null, limit: null };
      calls.push(trace);
      const builder = {
        select(_fields, options) { trace.selectOptions = options || {}; return this; },
        eq(k, v) { trace.filters.push(['eq', k, v]); return this; },
        not(k, op, v) { trace.filters.push(['not', k, op, v]); return this; },
        in(k, v) { trace.filters.push(['in', k, v]); return this; },
        gte(k, v) { trace.filters.push(['gte', k, v]); return this; },
        order(k, v) { trace.order = [k, v]; return this; },
        range(start, end) {
          trace.ranged = [start, end];
          if (table !== 'maintenance_work_orders') throw new Error('Unexpected pagination');
          if (failOrders) return Promise.resolve({ data: null, count: null, error: { code: 'PGRST205' } });
          return Promise.resolve({ data: orders.slice(start, end + 1), count: orders.length, error: null });
        },
        limit(n) {
          trace.limit = n;
          if (table === 'motil_ai_core_errors') return Promise.resolve({ data: [], count: 0, error: null });
          return this;
        },
        maybeSingle() {
          if (table !== 'bodega_central_stock_canonicalization_summary_v1') throw new Error('Unexpected singleton');
          return Promise.resolve({ data: { source_synced_at: NOW }, error: null });
        },
      };
      return builder;
    },
  };
  const accessMap = { mant_operaciones: access, bodega_inventario: stockAccess };
  const context = { ok: true, organizationId: ORG, userId: 'test-profile', role, supabase: sb };
  const mockedModules = {
    'next/server': {
      NextResponse: {
        json(body, options = {}) {
          return { body, status: options.status || 200, headers: options.headers || {} };
        },
      },
    },
    '@/lib/api/organization-context': { getOrganizationContext: async () => context },
    '@/lib/api/module-access': {
      getUserModuleAccess: async () => ({ cargoName, access: accessMap }),
      isAdminRole: (value) => value === 'admin',
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones', BODEGA_INVENTARIO: 'bodega_inventario' },
    },
    '@/lib/maintenance/viewer-mode': {
      resolveMaintenanceViewerMode: (cargo) => cargo?.startsWith('Mecánico') ? 'execution' :
        cargo === 'Jefe de Planificación' ? 'planning' : 'general',
    },
    '@/lib/maintenance/material-attention.mjs': { canReviewMaterialAttention },
    '@/lib/intelligence/motil-operational-canaries.mjs': { evaluateMotilOperationalCanaries },
  };
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'maintenance-guardrails-route.ts',
    reportDiagnostics: true,
  });
  assert.equal((transpiled.diagnostics || []).filter(d => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  runInNewContext(transpiled.outputText, {
    module,
    exports: module.exports,
    require(name) {
      if (!mockedModules[name]) throw new Error('Unexpected module ' + name);
      return mockedModules[name];
    },
    console: { warn() {}, error() {} },
  });
  return { GET: module.exports.GET, calls, ORG };
}

test('an ED mechanic cannot see other workers or warehouse through N3 canaries', async () => {
  const { GET, calls } = harness({ cargoName: 'Mecánico Planta', access: 'ED' });
  const response = await GET({});
  assert.equal(response.status, 403);
  assert.equal(calls.length, 0);
});

test('a planner without Bodega permission sees OT only and no inventory AI metadata', async () => {
  const { GET, calls } = harness({ cargoName: 'Jefe de Planificación', role: 'jefe_mantencion', stockAccess: 'SR' });
  const response = await GET({});
  assert.equal(response.status, 200);
  assert.equal(response.body.coverage.stockSourceChecked, false);
  assert.equal(calls.some(c => c.table === 'bodega_central_stock_canonicalization_summary_v1'), false);
  const ai = calls.find(c => c.table === 'motil_ai_core_errors');
  assert.deepEqual(ai.filters.find(f => f[0] === 'in' && f[1] === 'domain')[2], ['maintenance']);
  assert.equal(response.body.totalSignals, 0);
});

test('planner with Bodega access sees authorized source and both scoped AI domains', async () => {
  const { GET, calls } = harness({ cargoName: 'Jefe de Planificación', role: 'jefe_mantencion' });
  const response = await GET({});
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'no_issues_observed');
  assert.equal(response.body.coverage.stockSourceChecked, true);
  assert.equal(response.body.coverage.coreErrorsChecked, true);
  const ai = calls.find(c => c.table === 'motil_ai_core_errors');
  assert.deepEqual(ai.filters.find(f => f[0] === 'in' && f[1] === 'domain')[2], ['maintenance', 'inventory']);
  assert.equal(calls.every(c => c.filters.some(f => f[0] === 'eq' && f[1] === 'organization_id' && f[2] === ORG)), true);
  assert.equal(response.body.noAutomaticRemediation, true);
});

test('a real timer invariant issue becomes a bounded evidence-grounded finding', async () => {
  const { GET } = harness({
    cargoName: 'Jefe de Planificación',
    role: 'jefe_mantencion',
    workOrders: [{ id: 'ot-synthetic', status: 'completed', timer_status: 'running', timer_start_time: NOW, assigned_person_id: null }],
  });
  const response = await GET({});
  assert.equal(response.status, 200);
  assert.equal(response.body.findings[0].code, 'terminal_timer_active');
  assert.equal(response.body.findings[0].severity, 'P1');
  assert.equal(response.body.policy.operationalMutationExecuted, false);
});

test('failed OT source never produces a false healthy diagnosis', async () => {
  const { GET, calls } = harness({ cargoName: 'Jefe de Planificación', role: 'jefe_mantencion', failOrders: true });
  const result = await GET({});
  assert.equal(result.status, 503);
  assert.equal(calls.some(c => c.table === 'motil_ai_core_errors'), false);
});
