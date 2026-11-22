import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';

const routeSource = readFileSync(resolve(process.cwd(), 'app/api/bodega/stock-verification/route.ts'), 'utf8');
const ESTEBAN = 'a4616733-3bd1-45dc-8dfd-b483c22fcce1';
const OTHER = '11111111-1111-4111-8111-111111111111';
const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const PRODUCT = '22222222-2222-4222-8222-222222222222';
const WAREHOUSE = '8727e20d-f4f7-46b9-a0ec-4981b83f998a';
const SYNCED = '2026-11-22T06:11:41.398105+00:00';

function harness({ actor = ESTEBAN, active = true, sourceQuantity = 10, duplicate = false } = {}) {
  const writes = [];
  const source = {
    warehouse_id: WAREHOUSE,
    canonical_product_id: PRODUCT,
    product_external_id: '10001',
    sku: 'P-10001',
    unit_of_measure: 'UN',
    source_quantity: sourceQuantity,
    source_cutoff: SYNCED,
    source_synced_at: SYNCED,
    source_identity_count: 1,
  };

  const supabase = {
    from(table) {
      const builder = {
        filters: [],
        insertPayload: null,
        select() { return this; },
        eq(k, v) { this.filters.push([k, v]); return this; },
        insert(payload) { this.insertPayload = payload; writes.push({ table, payload }); return this; },
        async maybeSingle() {
          if (table === 'profiles') return { data: { status: active ? 'active' : 'inactive' }, error: null };
          if (table === 'bodega_central_stock_canonicalization_preview_v1') return { data: source, error: null };
          if (table === 'bodega_stock_verifier_assignments') return { data: actor === ESTEBAN ? { id: 'assignment' } : null, error: null };
          if (table === 'bodega_stock_physical_verifications') return { data: null, error: null };
          throw new Error('Unexpected read from ' + table);
        },
        async single() {
          assert.equal(table, 'bodega_stock_physical_verifications');
          if (duplicate) return { data: null, error: { code: '23505' } };
          return { data: { id: 'count', verified_at: SYNCED }, error: null };
        },
      };
      return builder;
    },
  };

  const module = { exports: {} };
  const javascript = typescript.transpileModule(routeSource, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'stock-verification-route.ts',
    reportDiagnostics: true,
  });
  assert.equal((javascript.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const context = { ok: true, organizationId: ORG, userId: actor, supabase };
  const modules = {
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } },
    '@/lib/api/organization-context': { getOrganizationContext: async () => context },
    '@/lib/api/module-access': { MODULE_KEYS: { BODEGA_INVENTARIO: 'bodega_inventario' }, requireModuleAccess: async () => ({
      authorized: true, accessLevel: 'ED', canWrite: true, user: { id: actor }, organizationId: ORG,
    }) },
  };
  runInNewContext(javascript.outputText, {
    module,
    exports: module.exports,
    require(name) { if (!modules[name]) throw new Error('Unexpected module ' + name); return modules[name]; },
    console,
  }, { filename: 'stock-verification-route.js' });

  const request = (overrides = {}) => ({
    text: async () => JSON.stringify({
      canonicalProductId: PRODUCT,
      countedQuantity: '10',
      expectedSourceQuantity: String(sourceQuantity),
      expectedSourceSyncedAt: SYNCED,
      confirmPhysicalCount: true,
      note: '',
      evidenceReference: '',
      requestId: '33333333-3333-4333-8333-333333333333',
      ...overrides,
    }),
  });
  return { POST: module.exports.POST, request, writes, source };
}

test('Esteban registers an exact physical count without changing operational stock', async () => {
  const { POST, request, writes } = harness();
  const result = await POST(request());
  assert.equal(result.status, 201);
  assert.equal(result.body.recorded, true);
  assert.equal(result.body.stockChanged, false);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].table, 'bodega_stock_physical_verifications');
  assert.equal(writes[0].payload.verified_by, ESTEBAN);
  assert.equal(writes[0].payload.organization_id, ORG);
  assert.equal(writes[0].payload.warehouse_id, WAREHOUSE);
  assert.equal(writes[0].payload.source_quantity, 10);
});

test('an editor who is not the designated Bodega verifier cannot record a count', async () => {
  const { POST, request, writes } = harness({ actor: OTHER });
  const result = await POST(request());
  assert.equal(result.status, 403);
  assert.equal(writes.length, 0);
});

test('outdated source numbers cannot be confirmed as a current Laudus comparison', async () => {
  const { POST, request, writes } = harness();
  const result = await POST(request({ expectedSourceQuantity: '9' }));
  assert.equal(result.status, 409);
  assert.equal(writes.length, 0);
});

test('a discrepancy requires an explanation, but never adjusts stock', async () => {
  const { POST, request, writes } = harness();
  const rejected = await POST(request({ countedQuantity: '8' }));
  assert.equal(rejected.status, 400);
  assert.equal(writes.length, 0);
  const accepted = await POST(request({ countedQuantity: '8', note: 'Conteo físico en estantería A' }));
  assert.equal(accepted.status, 201);
  assert.equal(writes.length, 1);
  assert.equal(writes[0].payload.counted_quantity, '8');
});

test('inactive and unconfirmed actors fail closed', async () => {
  const inactive = harness({ active: false });
  assert.equal((await inactive.POST(inactive.request())).status, 403);
  assert.equal(inactive.writes.length, 0);
  const unconfirmed = harness();
  assert.equal((await unconfirmed.POST(unconfirmed.request({ confirmPhysicalCount: false }))).status, 400);
  assert.equal(unconfirmed.writes.length, 0);
});

test('negative, malformed and overly precise physical quantities are rejected', async () => {
  const { POST, request, writes } = harness();
  for (const input of ['-1', '5.000,75', '1.1234567', 'NaN']) {
    const result = await POST(request({ countedQuantity: input }));
    assert.equal(result.status, 400, input);
  }
  assert.equal(writes.length, 0);
});

test('migration keeps physical verification append-only and tenant scoped', () => {
  const migration = readFileSync(resolve(process.cwd(), 'supabase/migrations/20261122040000_bodega_central_physical_verification.sql'), 'utf8');
  assert.match(migration, /unique \(organization_id, request_id\)/);
  assert.match(migration, /foreign key|references public\.profiles\(id\)/i);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.bodega_stock_physical_verifications from public, anon, authenticated/);
  assert.match(migration, /grant select, insert on public\.bodega_stock_physical_verifications to service_role/);
  assert.doesNotMatch(migration, /update public\.warehouse_stock|update public\.bodega_inventory/i);
});
