import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';
import typescript from 'typescript';

const source = readFileSync(resolve(process.cwd(), 'app/api/bodega/maintenance-supply/route.ts'), 'utf8');
const ORG = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';
const PRODUCT = '22222222-2222-4222-8222-222222222222';

function buildCase(stock) {
  const calls = [];
  const data = {
    work_order_material_requirements: [{
      id: 'req-1', work_order_id: 'ot-1', canonical_product_id: PRODUCT,
      quantity_required: 4, quantity_available: 10, quantity_shortage: 0,
      status: 'open', required_date: null, notes: null,
    }],
    bodega_stock_source_authority_service_v1: [{
      authority_state: 'laudus_primary', authority_reason: 'Corte verificado',
      latest_laudus_stock_sync: null, latest_laudus_stock_date: null,
    }],
    maintenance_work_orders: [{
      id: 'ot-1', work_order_number: 'OT-1', title: 'Cambiar repuesto',
      status: 'open', priority: 'high', scheduled_date: null,
    }],
    products: [{ id: PRODUCT, product_code: 'ABC', name: 'Repuesto ABC', unit: 'UD' }],
    laudus_central_warehouse_stock_reconciliation_v1: stock ? [{
      canonical_product_id: PRODUCT, laudus_stock: 23,
      product_reconciliation_status: stock, reconciliation_state: 'missing_in_motil',
      unit_of_measure: 'UD', source_date_to: null, laudus_synced_at: null,
    }] : [],
  };
  function from(table, schema = 'public') {
    calls.push({ table, schema });
    const rowSet = data[table];
    if (!rowSet) throw new Error('Unexpected query: ' + table);
    const query = {
      select() { return this; },
      eq(column, value) { if (column === 'organization_id') assert.equal(value, ORG); return this; },
      neq() { return this; },
      order() { return this; },
      limit() { return this; },
      in(column, values) { assert.equal(column === 'id' || column === 'canonical_product_id', true); assert.ok(values.length > 0); return this; },
      maybeSingle: async () => ({ data: rowSet[0] || null, error: null }),
      then(ok, fail) { return Promise.resolve({ data: rowSet, error: null }).then(ok, fail); },
    };
    return query;
  }
  const supabase = { from, schema(name) { return { from: (table) => from(table, name) }; } };
  const output = typescript.transpileModule(source, {
    compilerOptions: { target: typescript.ScriptTarget.ES2022, module: typescript.ModuleKind.CommonJS },
    fileName: 'maintenance-supply.ts',
    reportDiagnostics: true,
  });
  assert.equal((output.diagnostics || []).filter((e) => e.category === typescript.DiagnosticCategory.Error).length, 0);
  const module = { exports: {} };
  const modules = {
    'next/server': { NextResponse: { json(body, options = {}) { return { body, status: options.status || 200 }; } } },
    '@/lib/api/organization-context': { getOrganizationContext: async () => ({ ok: true, organizationId: ORG, userId: 'operator-1', supabase }) },
    '@/lib/api/module-access': { MODULE_KEYS: { BODEGA_INVENTARIO: 'bodega_inventario' }, requireModuleAccess: async () => ({ authorized: true }) },
  };
  runInNewContext(output.outputText, {
    module, exports: module.exports,
    require(name) { if (!modules[name]) throw new Error('Unexpected module ' + name); return modules[name]; },
    console,
  }, { filename: 'maintenance-supply.js' });
  return { GET: module.exports.GET, calls };
}

test('an ambiguous Laudus-to-MOTIL product mapping is not presented as available OT stock', async () => {
  const { GET, calls } = buildCase('identity_conflict');
  const result = await GET({});
  assert.equal(result.status, 200);
  assert.equal(result.body.rows.length, 1);
  assert.equal(result.body.rows[0].observedLaudusQuantity, null);
  assert.equal(result.body.rows[0].stockReconciliationState, 'review_identity_conflict');
  assert.equal(result.body.readOnly, true);
  assert.equal(calls.some((c) => c.table === 'laudus_inventory_reconciliation_service_v1'), false);
});

test('an unambiguous Central 002 match remains visible only as observed source quantity', async () => {
  const { GET } = buildCase('matched');
  const result = await GET({});
  assert.equal(result.status, 200);
  assert.equal(result.body.rows[0].observedLaudusQuantity, 23);
  assert.equal(result.body.rows[0].stockReconciliationState, 'missing_in_motil');
  assert.match(result.body.stockQuantityMeaning, /no representa una reserva/);
});

test('missing Central stock evidence remains unknown rather than becoming a false zero', async () => {
  const { GET } = buildCase(null);
  const result = await GET({});
  assert.equal(result.status, 200);
  assert.equal(result.body.rows[0].observedLaudusQuantity, null);
  assert.equal(result.body.rows[0].stockReconciliationState, 'review');
});
