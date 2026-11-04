import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/issues/route.ts', 'utf8');
const page = fs.readFileSync('app/dashboard/calidad-datos/laudus/page.tsx', 'utf8');
const qualityPage = fs.readFileSync('app/dashboard/calidad-datos/page.tsx', 'utf8');

test('Laudus central issues consolidates existing evidence without creating another master', () => {
  assert.match(route, /laudus_sync_health_service_v1/);
  assert.match(route, /laudus_inventory_reconciliation_summary_service_v1/);
  assert.match(route, /laudus_supplier_bridge_summary_service_v1/);
  assert.match(route, /laudus_fixed_assets_service_v1/);
  assert.match(route, /laudus_cost_centers_service_v1/);
  assert.match(route, /motil_get_laudus_data_quality_incident_summary_v2/);
  assert.doesNotMatch(route, /\.insert\(/);
  assert.doesNotMatch(route, /\.update\(/);
  assert.doesNotMatch(route, /\.upsert\(/);
  assert.doesNotMatch(route, /\.delete\(/);
});

test('Laudus central issues separates integration errors inconsistencies and reconciliation pending', () => {
  assert.match(route, /integration_error/);
  assert.match(route, /data_inconsistency/);
  assert.match(route, /reconciliation_pending/);
  assert.match(page, /Integración/);
  assert.match(page, /Inconsistencia/);
  assert.match(page, /Pendiente/);
});

test('Laudus central issues does not misclassify normal finance facts as errors', () => {
  assert.match(route, /Estados normales de negocio, como factura impaga o saldo por pagar, no se clasifican como error Laudus/);
  assert.match(page, /Una factura impaga o una CxP abierta es negocio normal/);
});

test('Laudus central issues preserves freshness-aware stock semantics', () => {
  assert.match(route, /hoursBetween/);
  assert.match(route, /lagHours > 24/);
  assert.match(route, /no como errores confirmados/);
  assert.match(page, /Sin falsos errores/);
});

test('Data Quality links the dedicated Laudus workspace', () => {
  assert.match(qualityPage, /\/dashboard\/calidad-datos\/laudus/);
  assert.match(qualityPage, /Incidencias Laudus/);
});
