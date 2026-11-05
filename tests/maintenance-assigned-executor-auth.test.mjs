import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const org = await readFile(new URL('../lib/api/organization-context.ts', import.meta.url), 'utf8');
const access = await readFile(new URL('../lib/maintenance/work-order-execution-access.ts', import.meta.url), 'utf8');
const workOrder = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');
const timer = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const close = await readFile(new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url), 'utf8');

test('assigned work-order execution bypass is narrow and excludes deletes', () => {
  assert.match(org, /method === 'PATCH'/);
  assert.match(org, /method === 'POST'/);
  assert.match(org, /\(timer\|close\|evidence\|standard-plan\|offline-notes\|fluids\)/);
  assert.match(org, /fluids\\\/closure/);
  assert.match(org, /work-order-runtime-evidence/);
  assert.doesNotMatch(org, /method === 'DELETE'.*work-orders/s);
});

test('non-elevated maintenance users are restricted to their assigned person identity', () => {
  assert.match(access, /profile_id', context\.userId/);
  assert.match(access, /assigned_person_id !== person\.id/);
  assert.match(access, /Sólo la persona asignada puede ejecutar esta orden de trabajo/);
});

test('assigned executor does not require general maintenance edit access to read or start own OT', () => {
  assert.match(workOrder, /getModuleAccessLevel/);
  assert.match(workOrder, /canExecuteAssigned/);
  assert.match(workOrder, /if \(!hasModuleWrite\)/);
  assert.match(workOrder, /isStartOnly/);
  assert.match(workOrder, /isExecutionEvidenceOnly/);
  assert.match(workOrder, /root_cause/);
  assert.match(workOrder, /preventive_actions/);
  assert.match(workOrder, /actual_duration_hours/);
});

test('timer keeps technician module writers scoped to canonical assignee, while close remains assigned only', () => {
  assert.match(timer, /accessLevel !== 'ED' \\|\\| context\.role === 'tecnico'/);
  assert.match(close, /requireAssignedMaintenanceExecution/);
  assert.match(close, /if \(!executionAccess\.ok\) return executionAccess\.response/);
  assert.doesNotMatch(close, /accessLevel !== 'ED'/);
});

test('assigned executor capability is identity based, not hard-coded by cargo or person name', () => {
  const assignedIdentityHelper = access.split('export function canBypassAssignedMaintenanceExecution')[0];
  assert.doesNotMatch(assignedIdentityHelper, /Joaquín|Ariel|Jefe de Taller|tecnico/);
  assert.match(access, /context\.role !== 'tecnico'/);
  assert.match(access, /profile_id', context\.userId/);
  assert.match(access, /employment_status', 'active'/);
});
