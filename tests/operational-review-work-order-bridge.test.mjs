import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const api = fs.readFileSync(new URL('../app/api/produccion/sondaje/mantenimiento/route.ts', import.meta.url), 'utf8');
const component = fs.readFileSync(new URL('../components/production/operational-maintenance-reviews.tsx', import.meta.url), 'utf8');
const page = fs.readFileSync(new URL('../app/dashboard/produccion/sondaje/produccion/page.tsx', import.meta.url), 'utf8');

test('production to maintenance bridge preserves module boundaries', () => {
  assert.match(api, /PROD_SONDAJE_PRODUCCION, true/);
  assert.match(api, /MANT_OPERACIONES, true/);
  assert.match(api, /organization_id/);
});

test('operational review creates work order through the canonical rpc', () => {
  assert.match(api, /create_work_order_from_operational_review/);
  assert.match(api, /review\.review_reason === 'out_of_service'/);
  assert.match(api, /status: 'accepted'/);
  assert.match(api, /linked_work_order_id/);
});

test('production reads the linked maintenance work order instead of copying its state', () => {
  assert.match(api, /from\('maintenance_work_orders'\)/);
  assert.match(api, /workOrder: review\.linked_work_order_id/);
  assert.match(component, /\/dashboard\/mantenimiento\/ordenes-trabajo\/\$\{linked\.id\}/);
  assert.match(component, /Aceptar y crear OT/);
  assert.match(page, /OperationalMaintenanceReviews/);
});


test('dismissed drilling evidence is removed from active maintenance flow', () => {
  assert.match(api, /\.neq\('status', 'dismissed'\)/);
});
