import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(
  'app/api/maintenance/work-order-close-queue/route.ts',
  'utf8',
);

test('close queue contains only work orders already in execution', () => {
  assert.match(
    route,
    /from\('work_order_close_readiness_v2'\)[\s\S]*\.eq\('organization_id', context\.organizationId\)[\s\S]*\.eq\('status', 'in_progress'\)/,
  );
});

test('requested open work orders cannot bypass the close-queue execution filter', () => {
  const statusFilterIndex = route.indexOf(".eq('status', 'in_progress')");
  const requestedFilterIndex = route.indexOf("readinessQuery = readinessQuery.eq('work_order_id', requestedWorkOrderId)");
  assert.ok(statusFilterIndex >= 0);
  assert.ok(requestedFilterIndex > statusFilterIndex);
});
