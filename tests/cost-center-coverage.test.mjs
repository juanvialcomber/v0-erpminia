import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(new URL('../app/api/cost-centers/coverage/route.ts', import.meta.url), 'utf8');
const queue = fs.readFileSync(new URL('../components/dashboard/cost-center-coverage-queue.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/dashboard/centros-costos/page.tsx', import.meta.url), 'utf8');

test('cost-center coverage is derived from operational owners without inventing mappings', () => {
  assert.match(route, /production_mine_sources/);
  assert.match(route, /maintenance_work_orders/);
  assert.match(route, /procurement_operational_orders/);
  assert.match(route, /\.is\('cost_center_id', null\)/);
  assert.match(route, /canonical_cost_centers_current/);
  assert.match(route, /\.eq\('is_active', true\)/);
});

test('assignment requires cost-center write access and owner-module write access', () => {
  assert.match(route, /requireModuleAccess\(request, MODULE_KEYS\.CORE_CENTROS_COSTOS, true\)/);
  assert.match(route, /requireModuleAccess\(request, config\.moduleKey, true\)/);
  assert.match(route, /MODULE_KEYS\.PROD_OPERACIONES/);
  assert.match(route, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(route, /MODULE_KEYS\.FIN_COMPRAS/);
});

test('coverage assignment only fills missing references and never overwrites existing ownership', () => {
  assert.match(route, /\.is\('cost_center_id', null\)/);
  assert.doesNotMatch(route, /upsert\(/);
  assert.match(queue, /Las asignaciones existentes se conservan/);
});

test('finance cost-center context surfaces the operational coverage queue', () => {
  assert.match(page, /CostCenterCoverageQueue/);
  assert.match(queue, /api\/cost-centers\/coverage/);
  assert.match(queue, /Producción/);
  assert.match(queue, /Mantención/);
  assert.match(queue, /Compras/);
});
