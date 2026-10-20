import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const api = fs.readFileSync('app/api/maintenance/preventive/route.ts', 'utf8');
const ui = fs.readFileSync('components/maintenance/preventive-plan-board.tsx', 'utf8');
const runtimeApi = fs.readFileSync('app/api/maintenance/runtime-readings/route.ts', 'utf8');
const runtimeUi = fs.readFileSync('app/dashboard/mantenimiento/horometros/page.tsx', 'utf8');

test('preventive planning loads operational candidates and hour evidence with tenant scope', () => {
  assert.match(api, /maintenance_operation_task_candidates_v1/);
  assert.match(api, /preventive_maintenance_hour_status_v1/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /meter_basis_warning/);
  assert.match(api, /needs_reconciliation/);
});

test('derived observations remain pending human review and do not create work automatically', () => {
  assert.match(api, /pending_human_review/);
  assert.match(ui, /No son diagnóstico ni OT hasta validación humana/);
  assert.match(ui, /Revisar como plan/);
  assert.doesNotMatch(ui, /Crear OT desde señal/);
});

test('planning warns when source meter is below last executed meter', () => {
  assert.match(api, /effective < lastExecuted/);
  assert.match(ui, /Reconciliar contador/);
  assert.match(ui, /reset, cambio de contador o error de (?:planilla|fuente)/);
  assert.match(ui, /Reconciliar evidencia/);
  assert.match(ui, /\/dashboard\/mantenimiento\/horometros\?asset=/);
});

test('existing open work orders are surfaced before promoting a candidate', () => {
  assert.match(api, /open_work_orders/);
  assert.match(ui, /OT abierta\(s\).*Revisar antes de crear trabajo adicional/);
});

test('horometer workspace derives a tenant-scoped reconciliation queue without rewriting source evidence', () => {
  assert.match(runtimeApi, /preventive_maintenance_hour_status_v1/);
  assert.match(runtimeApi, /reconciliationQueue/);
  assert.match(runtimeApi, /meter_below_last_execution/);
  assert.match(runtimeApi, /no_runtime_reading/);
  assert.match(runtimeApi, /\.eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(runtimeApi, /preventive_maintenance_schedules[\s\S]*\.update\(/);
});

test('horometer UI asks for observed evidence and preserves unknown values', () => {
  assert.match(runtimeUi, /Qué requiere reconciliación/);
  assert.match(runtimeUi, /no corregir automáticamente el contador/);
  assert.match(runtimeUi, /Registrar evidencia/);
  assert.match(runtimeUi, /value == null \? '—'/);
  assert.doesNotMatch(runtimeUi, /format\(Number\(value \|\| 0\)\)/);
});


test('operational maintenance suggestions require the latest accepted evidence cutoff', () => {
  assert.match(api, /motil_email_equipment_meter_stage/);
  assert.match(api, /motil_whatsapp_asset_360_latest_v1/);
  assert.match(api, /latestOperationalEvidenceDate/);
  assert.match(api, /String\(candidate\.last_observed_at \|\| ''\) >= latestOperationalEvidenceDate/);
  assert.match(api, /evidenceCutoff: latestOperationalEvidenceDate/);
});
