import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827220000_work_order_close_readiness_queue_v1.sql', 'utf8');
const migrationV2 = fs.readFileSync('supabase/migrations/20260827234500_integrate_standard_plan_steps_into_close_readiness_v2.sql', 'utf8');
const api = fs.readFileSync('app/api/maintenance/work-order-close-queue/route.ts', 'utf8');
const component = fs.readFileSync('components/maintenance/progressive-work-order-close-queue.tsx', 'utf8');
const page = fs.readFileSync('app/dashboard/mantenimiento/ordenes-trabajo/cierre/page.tsx', 'utf8');
const dictionaries = fs.readFileSync('lib/i18n/dictionaries.ts', 'utf8');
const schedule = fs.readFileSync('components/maintenance/maintenance-schedule.tsx', 'utf8');

test('closure readiness mirrors the safe close blockers', () => {
  assert.match(migration, /open_procurement_orders/);
  assert.match(migration, /pending_parts/);
  assert.match(migration, /unmet_material_requirements/);
  assert.match(migration, /pending_external_services/);
  assert.match(migration, /open_labor_entries/);
  assert.match(migration, /external_cost_conflict/);
  assert.match(migration, /record_root_cause/);
  assert.match(migration, /record_preventive_actions/);
  assert.match(migration, /record_actual_hours/);
  assert.match(migration, /close_work_order/);
});

test('closure readiness v2 adds standard plan execution without weakening blockers', () => {
  assert.match(migrationV2, /work_order_standard_plan_execution_v1/);
  assert.match(migrationV2, /complete_standard_plan_step/);
  assert.match(migrationV2, /standard_plan_steps_pending/);
  assert.match(migrationV2, /security_invoker=true/i);
});

test('closure queue API is tenant scoped and supports assigned executor access', () => {
  assert.match(api, /getModuleAccessLevel/);
  assert.match(api, /profile_id', context\.userId/);
  assert.match(api, /assigned_person_id', person\.id/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /work_order_close_readiness_v2/);
});

test('progressive closure exposes one next action and requires an explicit close click', () => {
  assert.match(component, /performNextAction/);
  assert.match(component, /current\.next_action === 'close_work_order'/);
  assert.match(component, /\/close/);
  assert.doesNotMatch(component, /patchCurrent\(\{ status:'completed'/);
  assert.match(component, /complete_standard_plan_step/);
  assert.match(component, /setStepObservation\(''\)/);
  assert.match(component, /searchParams\.get\('workOrderId'\)/);
  assert.match(page, /getDictionaryForRequest\(\)/);
  assert.match(dictionaries, /nextActionBadge: 'Siguiente acción'/);
  assert.match(dictionaries, /saveContinue: 'Guardar y continuar'/);
  assert.match(dictionaries, /closeFreeze: 'Cerrar OT y congelar costo'/);
});

test('scheduled maintenance hands completion to the safe progressive closure flow', () => {
  assert.match(schedule, /Completar cierre/);
  assert.match(schedule, /cierre\?workOrderId=/);
  assert.doesNotMatch(schedule, /status:\s*'completed'/);
});


test('requested closure flow is strictly scoped to one work order', () => {
  assert.match(api, /request\.nextUrl\.searchParams\.get\('workOrderId'\)/);
  assert.match(api, /readinessQuery = readinessQuery\.eq\('work_order_id', requestedWorkOrderId\)/);
  assert.match(component, /work-order-close-queue\?workOrderId=/);
  assert.doesNotMatch(component, /sort\(\(a, b\) => a\.work_order_id === selectedWorkOrderId/);
});
