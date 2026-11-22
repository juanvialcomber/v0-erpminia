import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import typescript from 'typescript';

const source = readFileSync(resolve(process.cwd(), 'app/api/maintenance/work-orders/[id]/reserve-parts/route.ts'), 'utf8');
const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const USER = '11111111-1111-4111-8111-111111111111';
const WO = '22222222-2222-4222-8222-222222222222';
const PRODUCT = '33333333-3333-4333-8333-333333333333';
const STOCK = '44444444-4444-4444-8444-444444444444';

function makeCase({ access = true, sameOrg = true, productError = null, scope = 'operational' } = {}) {
  const calls = [];
  const fixtures = {
    work_order_parts: { data: [{
      id: 'part-1', canonical_product_id: PRODUCT, warehouse_stock_id: STOCK,
      quantity_issued: 2, quantity_installed: 1, quantity_returned: 0, status: 'issued',
    }], error: null },
    stock_movements: { data: [{
      id: 'movement-1', stock_id: STOCK, movement_type: 'issue', quantity: 2,
    }], error: null },
    canonical_products_v1: { data: [{ id: PRODUCT, product_code: 'F-200', name: 'Filtro de aceite', unit: 'Unidad' }], error: productError },
    warehouse_stock: { data: [{ id: STOCK, part_code: 'F-200', part_name: 'Filtro', quantity_on_hand: 1, quantity_available: 1, unit_cost: 5 }], error: null },
  };
  const supabase = {
    schema(name) { throw new Error('Private canonical schema must never be requested: ' + name); },
    from(table) {
      calls.push({ table });
      const response = fixtures[table];
      if (!response) throw new Error('Unexpected source ' + table);
      return {
        select() { return this; },
        eq(column, value) {
          if (column === 'organization_id') assert.equal(value, ORG);
          if (column === 'work_order_id') assert.equal(value, WO);
          return this;
        },
        in(column, ids) {
          assert.ok(column === 'id');
          assert.ok(Array.from(ids).length > 0);
          return this;
        },
        order() { return this; },
        then(ok, fail) { return Promise.resolve(response).then(ok, fail); },
      };
    },
    rpc(name, args) {
      calls.push({ rpc: name });
      assert.equal(name, 'get_work_order_cost_summary');
      assert.equal(args.p_organization_id, ORG);
      assert.equal(args.p_work_order_id, WO);
      return Promise.resolve({ data: { parts_cost: 10, total_cost: 10 }, error: null });
    },
  };
  const transpiled = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'reserve-parts.ts', reportDiagnostics: true,
  });
  assert.equal((transpiled.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  const modules = {
    'next/server': {
      NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } },
    },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => ({ ok: true, userId: USER, organizationId: ORG, supabase }),
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      requireModuleAccess: async () => access
        ? { authorized: true, user: { id: USER }, organizationId: sameOrg ? ORG : 'wrong-org', canWrite: true }
        : { authorized: false, response: { status: 403 } },
    },
    '@/lib/maintenance/work-order-scope': {
      getMaintenanceWorkOrderScope: async () => scope,
      requireOperationalMaintenanceWorkOrder: async () => ({ ok: true }),
    },
  };
  runInNewContext(transpiled.outputText, {
    module, exports: module.exports, console,
    require(name) {
      if (!modules[name]) throw new Error('Unexpected module ' + name);
      return modules[name];
    },
  }, { filename: 'reserve-parts.js' });
  return {
    GET: () => module.exports.GET({}, { params: Promise.resolve({ id: WO }) }),
    calls,
  };
}

test('OT parts resolve from public canonical product projection, tenant filtered', async () => {
  const c = makeCase();
  const result = await c.GET();
  assert.equal(result.status, 200);
  assert.equal(result.body.reservedParts.length, 1);
  assert.equal(result.body.reservedParts[0].part.product_code, 'F-200');
  assert.equal(result.body.movements[0].stock.part_code, 'F-200');
  assert.equal(result.body.totals.issued, 2);
  assert.equal(result.body.canEdit, true);
  assert.equal(c.calls.some((x) => x.table === 'canonical_products_v1'), true);
});

test('a product lookup error never silently hides issued part identity', async () => {
  const c = makeCase({ productError: { code: 'PGRST205', message: 'projection missing' } });
  const result = await c.GET();
  assert.equal(result.status, 500);
  assert.match(result.body.error, /No se pudo cargar la trazabilidad/);
});

test('tenant scope mismatch denies requests before any database query', async () => {
  const c = makeCase({ sameOrg: false });
  const result = await c.GET();
  assert.equal(result.status, 403);
  assert.equal(c.calls.length, 0);
});

test('unauthorized access denies OT parts data', async () => {
  const c = makeCase({ access: false });
  const result = await c.GET();
  assert.equal(result.status, 403);
  assert.equal(c.calls.length, 0);
});

test('historical OT remains read-only but its part history is visible', async () => {
  const c = makeCase({ scope: 'historical' });
  const result = await c.GET();
  assert.equal(result.status, 200);
  assert.equal(result.body.canEdit, false);
  assert.equal(result.body.record_scope, 'historical');
});
