import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/bodega/inventory/route.ts','utf8');

test('Bodega inventory API respects the canonical source authority gate',()=>{
  assert.match(route,/bodega_stock_source_authority_service_v1/);
  assert.match(route,/authority_state !== 'laudus_primary'/);
  assert.match(route,/laudus_inventory_reconciliation_service_v1/);
  assert.match(route,/dataSource: 'laudus-primary'/);
  assert.match(route,/quantity: Number\(laudus\.laudus_stock\)/);
});

test('Bodega inventory API falls back honestly when Laudus is not authoritative',()=>{
  assert.match(route,/dataSource: 'motil-canonical'/);
  assert.match(route,/review_laudus_unavailable/);
  assert.match(route,/No fue posible leer el stock Laudus para esta página/);
});
