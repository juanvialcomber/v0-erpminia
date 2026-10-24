import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024005000_work_order_material_laudus_context.sql','utf8');
const route=fs.readFileSync('app/api/maintenance/work-orders/[id]/materials/route.ts','utf8');
const coverage=fs.readFileSync('components/maintenance/work-order-material-coverage.tsx','utf8');

test('OT materials receive read-only Laudus SKU context without inferring consumption',()=>{
  assert.match(migration,/motil_work_order_material_laudus_context/);
  assert.match(migration,/no_asset_consumption_inference/);
  assert.match(migration,/generic_sku_price_signal_disabled/);
  assert.match(migration,/currency_not_materialized/);
  assert.match(route,/laudusContext/);
  assert.match(coverage,/Contexto de compra del SKU; no prueba consumo por esta OT/);
});

test('unknown source currency is never labeled CLP',()=>{
  assert.match(coverage,/moneda no materializada/);
  assert.doesNotMatch(coverage,/currency: 'CLP'/);
  assert.match(coverage,/Precio fuente último/);
});