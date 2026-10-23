import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261023235900_product_laudus_intelligence.sql','utf8');
const api=fs.readFileSync('app/api/inventory/products/[id]/route.ts','utf8');
const page=fs.readFileSync('app/dashboard/bodega/productos/[id]/page.tsx','utf8');

test('Product 360 has product-specific Laudus intelligence without mixing sources',()=>{
  assert.match(migration,/motil_product_laudus_intelligence_preview/);
  assert.match(migration,/generic_sku/);
  assert.match(migration,/price_comparable/);
  assert.match(migration,/purchase_history_is_consumption/);
  assert.match(migration,/revoke all on function .* from public,anon,authenticated/);
  assert.match(api,/laudusIntelligence/);
  assert.match(page,/MOTIL Intelligence · Producto 360/);
  assert.match(page,/Laudus aporta historial de compra; no equivale a consumo físico/);
});

test('generic SKUs cannot create false price intelligence',()=>{
  assert.match(migration,/lower\(trim\(p\.product_code\)\) like 'otros%'/);
  assert.match(migration,/generic_sku_price_signal_disabled/);
  assert.match(page,/SKU genérico: usar sólo como contexto/);
  assert.match(page,/desactiva comparaciones de precio/);
});
