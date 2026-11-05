import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260829224500_harden_work_order_execution_lifecycle.sql',
  import.meta.url,
);
const closeRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url);
const timerRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url);
const workOrderRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url);

test('database lifecycle guard requires canonical assignment for active and completed states', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /before update of status on public\.maintenance_work_orders/i);
  assert.match(sql, /in \('in_progress', 'completed'\)[\s\S]*assigned_person_id is null/i);
  assert.match(sql, /lower\(coalesce\(new\.status, ''\)\) = 'closed'/i);
});

test('work timer refuses play or resume without canonical assignee', async () => {
  const sql = await readFile(migrationUrl, 'utf8');

  assert.match(sql, /p_action in \('play', 'resume'\)[\s\S]*v_wo\.assigned_person_id is null/i);
  assert.match(sql, /p_action in \('play', 'resume'\)[\s\S]*\('completed', 'closed', 'cancelled', 'canceled'\)/i);
});

test('timer mutation accepts module writers or the canonical assigned executor', async () => {
  const route = await readFile(timerRouteUrl, 'utf8');

  const postStart = route.indexOf('export async function POST');
  const getStart = route.indexOf('export async function GET');
  const postSection = route.slice(postStart, getStart);
  const getSection = route.slice(getStart);

  assert.match(postSection, /getModuleAccessLevel/);
  assert.match(postSection, /requireAssignedMaintenanceExecution/);
  assert.match(postSection, /accessLevel !== 'ED' && !executionAccess\.ok/);
  assert.match(getSection, /requireAssignedMaintenanceExecution/);
});

test('close endpoint reserves close to assigned executor and delegates the atomic transition to the timer-aware RPC', async () => {
  const route = await readFile(closeRouteUrl, 'utf8');
  const atomic = await readFile(new URL('../supabase/migrations/20261105195000_atomic_work_order_close_timer_v2.sql', import.meta.url), 'utf8');

  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.doesNotMatch(route, /accessLevel !== 'ED'/);
  assert.match(route, /rpc\('close_work_order_with_timer_v3'/);
  assert.match(atomic, /perform public\.close_work_order_safely\(p_work_order_id\)/);
  assert.doesNotMatch(route, /status:\s*['"]closed['"]/);
});

test('generic work-order completion delegates to the same atomic close v3 path', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');

  assert.match(route, /if \(body\.status === 'completed'\)/);
  assert.match(route, /if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.match(route, /rpc\('close_work_order_with_timer_v3'/);
  assert.doesNotMatch(route, /rpc\('close_work_order_safely'/);
});


test('in-progress work orders allow text corrections but block structural replanning', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');
  const detail = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');

  assert.match(route, /currentStatus === 'in_progress'/);
  assert.match(route, /\['work_type', 'priority', 'scheduled_date', 'assigned_person_id', 'cost_center_id'\]/);
  assert.match(route, /permite corregir el nombre o la descripción/);
  assert.match(route, /\['completed', 'closed', 'cancelled', 'canceled'\]\.includes\(currentStatus\)/);
  assert.match(detail, /La OT está en curso\. Puedes corregir el nombre o la descripción/);
  assert.match(detail, /workOrder\.status === 'in_progress' \? \{/);
});


test('planner work-order detail exposes a one-click edit action', async () => {
  const detail = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');
  assert.match(detail, /<Pencil className="mr-2 h-4 w-4" \/>Editar/);
  assert.match(detail, /id="edit-work-order"/);
  assert.match(detail, /setEditOpen\(true\)/);
  assert.match(detail, /scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/);
});


test('OT cancellation is timer-safe, reasoned and atomic', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');
  const detail = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');
  const migration = await readFile(new URL('../supabase/migrations/20261105223000_safe_ot_cancellation_v1.sql', import.meta.url), 'utf8');

  assert.match(route, /body\.status === 'cancelled' \|\| body\.status === 'canceled'/);
  assert.match(route, /cancel_work_order_safely_v1/);
  assert.match(route, /cancel_reason/);
  assert.match(detail, /Motivo de anulación/);
  assert.match(detail, /cancel_reason: cancelReason\.trim\(\)/);
  assert.match(migration, /coalesce\(v_wo\.timer_status, 'idle'\) in \('running', 'paused'\)/);
  assert.match(migration, /perform public\.update_work_order_timer\(/);
  assert.match(migration, /set status = 'cancelled'/);
  assert.match(migration, /'work_order_cancelled'/);
  assert.match(migration, /'reason', v_reason/);
});


test('every material OT edit is auditable with previous and next values', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');
  assert.match(route, /assigned_person_id', 'assigned_to_name', 'cost_center_id'/);
  assert.match(route, /actual_duration_hours', 'root_cause', 'preventive_actions', 'meter_reading', 'meter_unit'/);
  assert.match(route, /const changes = Object\.fromEntries/);
  assert.match(route, /previous:/);
  assert.match(route, /next:/);
  assert.match(route, /payload: \{ changed_fields: changedFields, changes \}/);
  assert.match(route, /actor_name: context\.userName \|\| context\.userEmail \|\| null/);
});


test('active OT cannot regress from in_progress to open while execution may still be timed', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');
  const detail = await readFile(new URL('../components/maintenance/work-order-detail.tsx', import.meta.url), 'utf8');

  assert.match(route, /allowedStatuses = new Set\(\['open', 'in_progress', 'completed', 'cancelled', 'canceled'\]\)/);
  assert.match(route, /currentStatus === 'in_progress' && requestedStatus === 'open'/);
  assert.match(route, /Pausa el trabajo o anula la OT con un motivo/);
  assert.doesNotMatch(detail, /patchOrder\(\{ status: 'open' \}\)/);
  assert.match(detail, /Cambios de estado protegidos/);
});
