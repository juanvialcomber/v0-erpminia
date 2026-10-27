import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const proxy = fs.readFileSync('proxy.ts', 'utf8');
const production = fs.readFileSync('components/dashboard/produccion-dashboard.tsx', 'utf8');
const inventory = fs.readFileSync('app/dashboard/bodega/page.tsx', 'utf8');
const warehouseLayout = fs.readFileSync('app/dashboard/bodega/layout.tsx', 'utf8');
const financeLayout = fs.readFileSync('app/dashboard/finanzas/layout.tsx', 'utf8');

test('read-only users cannot reach mutation workspaces through direct dashboard URLs', () => {
  assert.match(proxy, /DASHBOARD_EDIT_ROUTE_MODULES/);
  for (const route of [
    '/dashboard/produccion/ingreso-datos',
    '/dashboard/bodega/importar-datos',
    '/dashboard/compras/importar-existencias',
    '/dashboard/finanzas/pagos',
  ]) assert.match(proxy, new RegExp(route.replaceAll('/', '\\/')));
  assert.match(proxy, /row\.module_key === requiredEditModule && row\.access_level === 'ED'/);
});

test('read-only module access hides production, inventory, and finance mutations', () => {
  assert.match(production, /ready && canEdit\('prod_operaciones'\)/);
  assert.match(inventory, /ready && canEdit\('bodega_inventario'\) && canEdit\('fin_compras'\)/);
  assert.match(warehouseLayout, /canEdit\('bodega_inventario'\)/);
  assert.match(financeLayout, /canEdit\('fin_finanzas'\)/);
  assert.doesNotMatch(fs.readFileSync('app/dashboard/finanzas/page.tsx', 'utf8'), /useState|fetch\(|mutation|POST/);
});
