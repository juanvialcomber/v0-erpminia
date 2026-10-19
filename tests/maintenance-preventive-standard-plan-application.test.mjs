import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const preventiveApi = fs.readFileSync('app/api/maintenance/preventive-hours/route.ts', 'utf8');
const planApi = fs.readFileSync('app/api/maintenance/work-orders/[id]/standard-plan/route.ts', 'utf8');
const panel = fs.readFileSync('components/maintenance/work-order-standard-plan-panel.tsx', 'utf8');
const detail = fs.readFileSync('components/maintenance/work-order-detail.tsx', 'utf8');
const apply = fs.readFileSync('lib/maintenance/apply-standard-job-plan.ts', 'utf8');

test('preventive planning applies only an active approved standard plan for the same schedule', () => {
  assert.match(preventiveApi, /maintenance_standard_job_plan_applications/);
  assert.match(preventiveApi, /preventive_schedule_id/);
  assert.match(preventiveApi, /eq\('status', 'active'\)/);
  assert.match(preventiveApi, /eq\('status', 'approved'\)/);
  assert.match(preventiveApi, /applyStandardJobPlanToWorkOrder/);
});

test('existing generated preventive OT can receive a newly approved plan idempotently', () => {
  assert.match(preventiveApi, /schedule\.generated_work_order_id/);
  assert.match(preventiveApi, /applyApprovedPlanIfAvailable\(context, scheduleId, schedule\.generated_work_order_id\)/);
  assert.match(preventiveApi, /existing: true/);
});

test('new preventive OT is created first and then enriched with the approved plan', () => {
  assert.match(preventiveApi, /plan_due_hour_preventive_work_order_v1/);
  assert.match(preventiveApi, /applyApprovedPlanIfAvailable\(context, scheduleId, workOrderId\)/);
  assert.match(preventiveApi, /standardPlanApplied/);
});

test('standard plan application preserves existing material requirements', () => {
  assert.match(apply, /existingIds/);
  assert.match(apply, /!existingIds\.has/);
  assert.match(apply, /createdRequirements/);
});

test('work order standard plan endpoint is maintenance authorized and tenant scoped', () => {
  assert.match(planApi, /MODULE_KEYS\.MANT_OPERACIONES/);
  assert.match(planApi, /eq\('organization_id', context\.organizationId\)/);
  assert.match(planApi, /work_order_id/);
  assert.match(planApi, /maintenance_standard_job_plan_steps/);
  assert.match(planApi, /maintenance_standard_job_plan_materials/);
});

test('work order UI exposes approved steps controls and canonical materials', () => {
  assert.match(panel, /Plan aprobado/);
  assert.match(panel, /Secuencia de trabajo/);
  assert.match(panel, /Controles previos/);
  assert.match(panel, /Repuestos requeridos/);
  assert.match(detail, /WorkOrderStandardPlanPanel/);
});


test('test-only or UAT standard plans cannot be applied to operational work orders', () => {
  assert.match(apply, /maintenance_standard_job_plan_steps/);
  assert.match(apply, /declaredNonOperational/);
  assert.match(apply, /uat controlado/);
  assert.match(apply, /no representa una intervencion real de terreno/);
  assert.match(apply, /UAT\/prueba/);
});
