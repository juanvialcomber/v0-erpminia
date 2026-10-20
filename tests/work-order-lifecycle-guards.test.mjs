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

test('legacy close endpoint delegates terminal transition to canonical RPC', async () => {
  const route = await readFile(closeRouteUrl, 'utf8');

  assert.match(route, /getModuleAccessLevel/);
  assert.match(route, /requireAssignedMaintenanceExecution/);
  assert.match(route, /accessLevel !== 'ED' && !executionAccess\.ok/);
  assert.match(route, /rpc\('close_work_order_safely'/);
  assert.doesNotMatch(route, /status:\s*['"]closed['"]/);
});

test('generic work-order completion already delegates to canonical RPC', async () => {
  const route = await readFile(workOrderRouteUrl, 'utf8');

  assert.match(route, /if \(body\.status === 'completed'\)/);
  assert.match(route, /rpc\('close_work_order_safely'/);
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
