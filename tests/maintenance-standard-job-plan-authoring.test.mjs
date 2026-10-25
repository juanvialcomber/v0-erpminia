import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827233000_standard_job_plan_authoring_v1.sql','utf8');
const preventive = fs.readFileSync('app/dashboard/mantenimiento/preventivo-horas/page.tsx','utf8');
const preventiveApi = fs.readFileSync('app/api/maintenance/preventive-hours/route.ts','utf8');
const apply = fs.readFileSync('lib/maintenance/apply-standard-job-plan.ts','utf8');

const proposalFn = migration.split('create or replace function public.add_standard_job_plan_step_v1')[0];

test('standard plan proposal comes from an existing preventive schedule without invented steps', () => {
  assert.match(proposalFn,/propose_standard_job_plan_from_schedule_v1/);
  assert.match(proposalFn,/preventive_maintenance_schedules/);
  assert.match(proposalFn,/'proposed'/i);
  assert.doesNotMatch(proposalFn,/insert into public\.maintenance_standard_job_plan_steps/i);
});

test('standard plan cannot be approved empty', () => {
  assert.match(migration,/Agrega al menos un paso antes de aprobar/);
  assert.match(migration,/maintenance_standard_job_plan_steps/);
  assert.match(migration,/status='approved'/);
});

test('standard plan authoring RPCs remain backend only', () => {
  assert.match(migration,/revoke all on function public\.propose_standard_job_plan_from_schedule_v1.*public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.propose_standard_job_plan_from_schedule_v1.*service_role/i);
});

test('preventive hours exposes standard plan workspace with live tenant-scoped readiness', () => {
  assert.match(preventive,/Planes estándar/);
  assert.match(preventive,/Procedimientos estándar disponibles/);
  assert.match(preventive,/standardPlans\.approved>0/);
  assert.match(preventiveApi,/maintenance_standard_job_plans/);
  assert.match(preventiveApi,/maintenance_standard_job_plan_applications/);
  assert.match(preventiveApi,/eq\('organization_id', context\.organizationId\)/);
  assert.doesNotMatch(preventive,/hoy no existen planes estándar aprobados ni BOM técnico cargado/i);
});

test('approved plan application preserves existing material requirements', () => {
  assert.match(apply,/existingIds/);
  assert.match(apply,/filter\(\(row: any\) => !existingIds\.has/);
  assert.match(apply,/createdRequirements/);
});


test('MOTIL-generated plan proposals are explicit and still require human completion', () => {
  const api = fs.readFileSync('app/api/maintenance/standard-job-plans/route.ts','utf8');
  const page = fs.readFileSync('app/dashboard/mantenimiento/planes-estandar/page.tsx','utf8');

  assert.match(api,/proposal_source: plan\.proposed_by \? 'human' : 'motil'/);
  assert.match(api,/Ariel debe completar el procedimiento antes de aprobar/);
  assert.match(page,/Propuesto por MOTIL/);
  assert.match(page,/Completar antes de aprobar/);
});


test('weekly planning carries an approved standard plan into new OT creation', () => {
  const weekly = fs.readFileSync('components/maintenance/weekly-maintenance-planning.tsx','utf8');
  const create = fs.readFileSync('components/maintenance/create-work-order.tsx','utf8');
  const route = fs.readFileSync('app/api/maintenance/work-orders/route.ts','utf8');

  assert.match(weekly,/standardPlanId/);
  assert.match(weekly,/standardPlanName/);
  assert.match(create,/standardPlanId/);
  assert.match(create,/Plan estándar aprobado/);
  assert.match(route,/applyRequestedStandardPlan/);
  assert.match(route,/applyStandardJobPlanToWorkOrder/);
});

test('standard plan application during OT creation is idempotent and keeps material deduplication', () => {
  const route = fs.readFileSync('app/api/maintenance/work-orders/route.ts','utf8');
  assert.match(route,/idempotentReplay/);
  assert.match(route,/applyRequestedStandardPlan\(context, replayedOrder\.id, standardPlanId\)/);
  assert.match(apply,/activeApplication/);
  assert.match(apply,/existingIds/);
});


test('standard plan is validated before a new OT can be inserted', () => {
  const route = fs.readFileSync('app/api/maintenance/work-orders/route.ts','utf8');
  const approvalCheck = route.indexOf("plan.status !== 'approved'");
  const assetCheck = route.indexOf("plan.canonical_asset_id && plan.canonical_asset_id !== canonicalAssetId");
  const insertOrder = route.indexOf(".from('maintenance_work_orders')\n        .insert({");
  assert.ok(approvalCheck >= 0);
  assert.ok(assetCheck >= 0);
  assert.ok(insertOrder >= 0);
  assert.ok(approvalCheck < insertOrder);
  assert.ok(assetCheck < insertOrder);
  assert.match(route, /planEstimatedHours/);
  assert.match(route, /plannedHours = Number/);
});
