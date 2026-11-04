import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/replacement-map/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/calidad-datos/reemplazo-laudus/page.tsx','utf8');
const layout = fs.readFileSync('app/dashboard/calidad-datos/layout.tsx','utf8');

test('replacement map covers the operational domains blocking Laudus retirement',()=>{
  for (const label of ['Inventario','Proveedores','Órdenes de compra','Facturas','Cuentas por pagar','Activos','Bancos','DTE / SII','Contabilidad','Clientes / Ventas']) {
    assert.ok(route.includes(label), 'missing domain: ' + label);
  }
  assert.match(route,/zero_daily_operational_dependency/);
  assert.match(route,/laudusWritesAllowed: false/);
  assert.match(route,/automaticCanonicalPromotion: false/);
});

test('replacement dashboard exposes blockers and one action per domain',()=>{
  assert.match(page,/Reemplazo Laudus/);
  assert.match(page,/cero dependencia operacional diaria/);
  assert.match(page,/Pendientes detectados/);
  assert.match(page,/Resolver/);
  assert.match(layout,/reemplazo-laudus/);
});


test('replacement dashboard can scan one bounded invoice-trace batch explicitly',()=>{
  assert.match(page,/native-invoice-trace\/sync/);
  assert.match(page,/Escanear 5/);
  assert.match(page,/method: 'POST'/);
  assert.match(page,/await mutate\(\)/);
});
