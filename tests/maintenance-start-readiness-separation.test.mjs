import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const readiness = fs.readFileSync('lib/maintenance/work-order-release-readiness.ts','utf8');
const patchRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/route.ts','utf8');

test('start readiness requires structural execution prerequisites only', () => {
  assert.match(readiness, /if \(!checks\.asset\) blockers\.push/);
  assert.match(readiness, /if \(!checks\.assignee\) blockers\.push/);
  assert.match(readiness, /!emergencyBypass && !checks\.schedule/);
});

test('material, procurement and external-service gaps stay advisory for start', () => {
  assert.match(readiness, /Start-readiness is intentionally narrower than close-readiness/);
  assert.doesNotMatch(readiness, /blockers\.push\(\{ code: 'materials'/);
  assert.doesNotMatch(readiness, /blockers\.push\(\{ code: 'procurement'/);
  assert.doesNotMatch(readiness, /blockers\.push\(\{ code: 'external_services'/);
  assert.match(readiness, /materials: Number\(typedReadiness\.unmet_material_requirements/);
  assert.match(readiness, /procurement: Number\(typedReadiness\.open_procurement_orders/);
  assert.match(readiness, /externalServices: Number\(typedReadiness\.pending_external_services/);
});

test('work-order start still enforces assigned execution and readiness', () => {
  assert.match(patchRoute, /requireAssignedMaintenanceExecution/);
  assert.match(patchRoute, /getWorkOrderReleaseReadiness/);
  assert.match(patchRoute, /if \(!releaseReadiness\.ready\)/);
  assert.match(patchRoute, /findOtherRunningWorkOrder/);
});
