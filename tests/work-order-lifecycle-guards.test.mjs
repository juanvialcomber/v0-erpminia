import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migrationUrl = new URL(
  '../supabase/migrations/20260829224500_harden_work_order_execution_lifecycle.sql',
  import.meta.url,
);
const closeRouteUrl = new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url);
const timerCouplingMigrationUrl = new URL(
  '../supabase/migrations/20261105180000_harden_ot_timer_status_coupling.sql',
  import.meta.url,
);
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

test('legacy close endpoint reserves close to assigned executor and delegates terminal transition to canonical RPC', async () => {
  const route = await readFile(closeRouteUrl, 'utf8');

  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.doesNotMatch(route, /accessLevel !== 'ED'/);
  assert.match(route, /rpc\('close_work_order_safely'/);
  assert.doesNotMatch(route, /status:\s*['"]closed['"]/);
});

test('generic work-order PATCH cannot bypass the canonical close contract', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');

  assert.match(route, /if \(body\.status === 'completed'\)/);
  assert.match(route, /El cierre de la OT debe realizarse desde el flujo de cierre/);
  assert.match(route, /canonical_close_endpoint/);
  assert.doesNotMatch(route, /rpc\('close_work_order_safely'/);
});

test('database couples timer state to in-progress OT lifecycle', async () => {
  const sql = await readFile(timerCouplingMigrationUrl, 'utf8');

  assert.match(sql, /before update of status, timer_status/i);
  assert.match(sql, /v_timer_status in \('running', 'paused'\)[\s\S]*v_status <> 'in_progress'/i);
  assert.match(sql, /v_status in \('completed', 'closed', 'cancelled', 'canceled'\)[\s\S]*v_timer_status <> 'idle'/i);
  assert.match(sql, /create unique index if not exists maintenance_one_running_timer_per_person_idx/i);
  assert.match(sql, /where timer_status = 'running'[\s\S]*assigned_person_id is not null/i);
});

test('canonical close never derives downtime or availability from OT wall-clock time', async () => {
  const route = await readFile(closeRouteUrl, 'utf8');

  assert.doesNotMatch(route, /equipment_availability/);
  assert.doesNotMatch(route, /availability_percentage/);
  assert.doesNotMatch(route, /Date\.now\(\) - startTime\.getTime\(\)/);
  assert.doesNotMatch(route, /down_time_hours:\s*downtime/);
  assert.match(route, /actual_duration_hours: effectiveHours/);
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

test('timer endpoint maps database concurrency races to a user-level conflict', async () => {
  const route = await readFile(timerRouteUrl, 'utf8');

  assert.match(route, /error\?\.code === '23505'/);
  assert.match(route, /otra OT con el cronómetro en ejecución/);
});
