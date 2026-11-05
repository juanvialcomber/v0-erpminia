import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const runtimeAuth = await readFile(
  new URL('../supabase/migrations/20261007142000_fix_runtime_evidence_operational_auth.sql', import.meta.url),
  'utf8',
);
const standardPlanAuth = await readFile(
  new URL('../supabase/migrations/20261007142500_fix_standard_plan_assigned_executor_auth.sql', import.meta.url),
  'utf8',
);
const safeClose = await readFile(
  new URL('../supabase/migrations/20261005202500_close_work_order_assigned_executor.sql', import.meta.url),
  'utf8',
);
const closeQueue = await readFile(
  new URL('../app/api/maintenance/work-order-close-queue/route.ts', import.meta.url),
  'utf8',
);
const closeRoute = await readFile(
  new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url),
  'utf8',
);
const evidenceRoute = await readFile(
  new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url),
  'utf8',
);
const standardPlanRoute = await readFile(
  new URL('../app/api/maintenance/work-orders/[id]/standard-plan/route.ts', import.meta.url),
  'utf8',
);
const runtimeRoute = await readFile(
  new URL('../app/api/maintenance/work-order-runtime-evidence/route.ts', import.meta.url),
  'utf8',
);

function assertCanonicalClosureAuthorization(source) {
  assert.match(source, /public\.profiles/);
  assert.match(source, /public\.role_matrix/);
  assert.match(source, /rm\.module_key = 'mant_operaciones'/);
  assert.match(source, /rm\.access_level = 'ED'/);
  assert.match(source, /public\.people/);
  assert.match(source, /pe\.profile_id = v_actor/);
  assert.match(source, /pe\.employment_status = 'active'/);
}

test('all privileged closure RPCs accept maintenance editors and the assigned executor', () => {
  assertCanonicalClosureAuthorization(runtimeAuth);
  assertCanonicalClosureAuthorization(standardPlanAuth);
  assertCanonicalClosureAuthorization(safeClose);
  assert.match(runtimeAuth, /pe\.id = v_wo\.assigned_person_id/);
  assert.match(standardPlanAuth, /pe\.id = v_assigned_person_id/);
  assert.match(safeClose, /pe\.id = v_wo\.assigned_person_id/);
});

test('closure HTTP routes preserve assigned-executor capability', () => {
  assert.match(closeRoute, /requireAssignedMaintenanceExecution/);
  assert.match(evidenceRoute, /requireAssignedMaintenanceExecution/);
  assert.match(standardPlanRoute, /requireAssignedMaintenanceExecution/);
  assert.match(runtimeRoute, /requireAssignedMaintenanceExecution/);
});

test('closure queue scopes field technicians even when their module matrix is ED', () => {
  assert.match(closeQueue, /canBypassAssignedMaintenanceExecution/);
  assert.match(closeQueue, /assigned_person_id/);
  assert.match(closeQueue, /canEditAssigned = allowedWorkOrderIds\.length > 0/);
  assert.match(closeQueue, /canEdit: accessLevel === 'ED' \|\| canEditAssigned/);
});
