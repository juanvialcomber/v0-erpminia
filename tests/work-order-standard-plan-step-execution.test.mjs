import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827234000_work_order_standard_plan_step_execution_v1.sql','utf8');
const route = fs.readFileSync('app/api/maintenance/work-orders/[id]/standard-plan/route.ts','utf8');
const panel = fs.readFileSync('components/maintenance/work-order-standard-plan-panel.tsx','utf8');

test('standard plan execution records actor time and observation', () => {
  assert.match(migration,/work_order_standard_plan_step_executions/);
  assert.match(migration,/completed_by/);
  assert.match(migration,/completed_at/);
  assert.match(migration,/observation/);
  assert.match(migration,/standard_plan_step_completed/);
});

test('standard plan execution stays backend only and tenant checked', () => {
  assert.match(migration,/current_application_user_id/);
  assert.match(migration,/user_roles/);
  assert.match(migration,/revoke all on table public\.work_order_standard_plan_step_executions from public,anon,authenticated/i);
  assert.match(migration,/grant execute on function public\.complete_work_order_standard_plan_step_v1\(uuid,uuid,text\) to service_role/i);
  assert.match(migration,/security_invoker=true/i);
});

test('work order closure blocks pending standard plan steps', () => {
  assert.match(migration,/execution_status='pending'/);
  assert.match(migration,/Completa todos los pasos del plan estándar antes de cerrar la OT/);
});

test('standard plan API exposes execution state and completes through RPC', () => {
  assert.match(route,/work_order_standard_plan_execution_v1/);
  assert.match(route,/pendingSteps/);
  assert.match(route,/complete_work_order_standard_plan_step_v1/);
  assert.match(route,/getMaintenanceActorAuthority/);
  assert.match(route,/requireAssignedMaintenanceExecution/);
  assert.match(route,/if \(!executionAccess\.ok\) return executionAccess\.response/);
});

test('work order plan UI is progressive and explicit', () => {
  assert.match(panel,/Realizado/);
  assert.match(panel,/Pendiente/);
  assert.match(panel,/Marcar realizado/);
  assert.match(panel,/Observación opcional/);
  assert.match(panel,/cierre de la OT permanecerá bloqueado/i);
});
