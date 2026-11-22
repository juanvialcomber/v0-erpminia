import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import test from 'node:test';
import typescript from 'typescript';

const source = readFileSync(resolve(process.cwd(), 'app/api/maintenance/material-catalog/route.ts'), 'utf8');
const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const PRODUCT = '11111111-1111-4111-8111-111111111111';

const oneProduct = {
  id: PRODUCT, product_code: 'AC-001', name: 'Aceite hidráulico',
  family: 'Lubricantes', unit: 'Litro', is_active: true,
};
const oneObservation = {
  canonical_product_id: PRODUCT, laudus_stock: 12.5,
  product_reconciliation_status: 'matched', reconciliation_state: 'quantity_mismatch',
  source_date_to: '2026-11-22T09:00:00Z', laudus_synced_at: '2026-11-22T09:05:00Z',
};

function buildCase({ level = 'LEC', search = 'aceite', stockRows = [oneObservation], stockError = null, products = [oneProduct] } = {}) {
  const calls = [];
  const responses = {
    canonical_products_v1: { data: products, error: null },
    laudus_central_warehouse_stock_reconciliation_v1: { data: stockRows, error: stockError },
  };
  const supabase = {
    from(table) {
      calls.push({ table });
      const result = responses[table];
      if (!result) throw new Error('Unexpected stock lookup: ' + table);
      return {
        select() { return this; },
        eq(column, value) {
          calls.push({ column, value });
          if (column === 'organization_id') assert.equal(value, ORG);
          return this;
        },
        or(filter) { calls.push({ filter }); return this; },
        in(column, ids) {
          assert.equal(column, 'canonical_product_id');
          assert.deepEqual(Array.from(ids), [PRODUCT]);
          return this;
        },
        limit(n) { assert.ok(n > 0 && n <= 300); return this; },
        then(ok, fail) { return Promise.resolve(result).then(ok, fail); },
      };
    },
  };
  const output = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'material-catalog.ts',
    reportDiagnostics: true,
  });
  assert.equal((output.diagnostics || []).filter((d) => d.category === typescript.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  const modules = {
    'next/server': { NextResponse: { json(body, opts = {}) { return { body, status: opts.status || 200 }; } } },
    '@/lib/api/organization-context': {
      getOrganizationContext: async () => ({ ok: true, organizationId: ORG, userId: 'auth-user', role: 'viewer', supabase }),
    },
    '@/lib/api/module-access': {
      MODULE_KEYS: { MANT_OPERACIONES: 'mant_operaciones' },
      getModuleAccessLevel: async () => level,
    },
  };
  runInNewContext(output.outputText, {
    module, exports: module.exports, console,
    require(name) {
      if (!modules[name]) throw new Error('Unexpected module ' + name);
      return modules[name];
    },
  }, { filename: 'material-catalog.js' });
  return {
    run: () => module.exports.GET({ nextUrl: { searchParams: new URLSearchParams({ q: search }) } }),
    calls,
  };
}

test('materials search uses product master and Central Laudus, never legacy quantity_available', async () => {
  const c = buildCase();
  const result = await c.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.rows.length, 1);
  assert.equal(result.body.rows[0].productId, PRODUCT);
  assert.equal(result.body.rows[0].observedLaudusQuantity, 12.5);
  assert.equal(result.body.rows[0].stockReconciliationState, 'quantity_mismatch');
  assert.equal(Object.hasOwn(result.body.rows[0], 'quantityAvailable'), false);
  assert.equal(result.body.stockEvidenceAvailable, true);
  assert.match(result.body.stockQuantityMeaning, /no representa stock disponible/);
  const tables = c.calls.filter((call) => call.table).map((call) => call.table);
  assert.deepEqual(tables, [
    'canonical_products_v1',
    'laudus_central_warehouse_stock_reconciliation_v1',
  ]);
});

test('duplicate Laudus identities cannot turn into arbitrary observed stock', async () => {
  const c = buildCase({ stockRows: [oneObservation, { ...oneObservation, laudus_stock: 99 }] });
  const result = await c.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.rows[0].observedLaudusQuantity, null);
  assert.equal(result.body.rows[0].stockReconciliationState, 'review_identity_conflict');
});

test('missing and null source quantities do not turn into zero balances', async () => {
  for (const observations of [[], [{ ...oneObservation, laudus_stock: null }]]) {
    const result = await buildCase({ stockRows: observations }).run();
    assert.equal(result.status, 200);
    assert.equal(result.body.rows[0].observedLaudusQuantity, null);
  }
});

test('Laudus outage degrades stock evidence but keeps material identity searchable', async () => {
  const c = buildCase({ stockError: { code: 'PGRST205' }, stockRows: [] });
  const result = await c.run();
  assert.equal(result.status, 200);
  assert.equal(result.body.rows.length, 1);
  assert.equal(result.body.stockEvidenceAvailable, false);
  assert.equal(result.body.rows[0].observedLaudusQuantity, null);
  assert.equal(result.body.rows[0].stockReconciliationState, 'source_unavailable');
});

test('only maintenance readers and editors may search canonical products', async () => {
  const c = buildCase({ level: 'SR' });
  const result = await c.run();
  assert.equal(result.status, 403);
  assert.equal(c.calls.length, 0);
});

test('PostgREST syntax characters are removed from the search filter', async () => {
  const c = buildCase({ search: 'aceite),otro.eq.admin%' });
  const result = await c.run();
  assert.equal(result.status, 200);
  const filters = c.calls.filter((call) => call.filter).map((call) => call.filter);
  assert.equal(filters.length, 1);
  assert.doesNotMatch(filters[0], /[(),]/);
});
