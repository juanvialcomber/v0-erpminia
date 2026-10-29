import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/compras/purchase-orders/route.ts','utf8');
const list = fs.readFileSync('components/compras/purchase-orders-list.tsx','utf8');

test('purchase orders default to current canonical data and isolate the legacy baseline',()=>{
  assert.match(route,/scope = searchParams\.get\('scope'\) === 'history' \? 'history' : 'current'/);
  assert.match(route,/canonical_purchase_orders_v1/);
  assert.match(route,/source_file\.is\.null,source_file\.neq\.public\.purchase_orders/);
  assert.match(route,/source_file', 'public\.purchase_orders'/);
  assert.match(route,/Archivo histórico importado; no representa compras vigentes/);
});

test('purchase order UI makes current versus historical scope explicit',()=>{
  assert.match(list,/useState<'current' \| 'history'>\('current'\)/);
  assert.match(list,/Vigentes/);
  assert.match(list,/Histórico/);
  assert.match(list,/scope === 'current' \? 'Compras vigentes y operación actual\.'/);
});
