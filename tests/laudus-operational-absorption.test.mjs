import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const compras = readFileSync(new URL('../app/dashboard/compras/page.tsx', import.meta.url), 'utf8');
const pagos = readFileSync(new URL('../app/dashboard/finanzas/pagos/page.tsx', import.meta.url), 'utf8');

test('Compras no claims Laudus API is still awaiting commercial enablement', () => {
  assert.doesNotMatch(compras, /Pendiente de habilitación comercial de API/);
  assert.doesNotMatch(compras, /Esperando acceso y primera sincronización/);
  assert.match(compras, /Laudus está conectado/);
});

test('Tesoreria exposes read-only Laudus accounts payable inside MOTIL', () => {
  assert.match(pagos, /\/api\/integrations\/laudus\/finance-control/);
  assert.match(pagos, /CxP ERP/);
  assert.match(pagos, /Obligaciones ERP disponibles para contraste y seguimiento/);
  assert.match(pagos, /Fuente: Laudus · contraste financiero dentro de MOTIL/);
});


test('Finance suppliers exposes Laudus historical supplier resolution inside MOTIL', () => {
  const suppliersPage = readFileSync(new URL('../app/dashboard/finanzas/proveedores/page.tsx', import.meta.url), 'utf8');
  assert.match(suppliersPage, /LaudusSupplierResolutionQueueCard/);
});
