import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const close = readFileSync('app/api/maintenance/work-orders/[id]/close/route.ts', 'utf8');
const queue = readFileSync('app/api/maintenance/work-order-close-queue/route.ts', 'utf8');
test('close preserves duration without fabricating equipment metrics', () => {
  assert.doesNotMatch(close, /equipment_availability|down_time_hours:\\s*downtime/);
  assert.match(close, /actual_duration_hours: effectiveHours, mttr: null, downtime_hours: null, availability_percentage: null/);
});
test('close queue limits results to execution before optional ID filter', () => {
  const filter = queue.indexOf(".eq('status', 'in_progress')");
  assert.ok(filter >= 0 && filter < queue.indexOf("readinessQuery = readinessQuery.eq('work_order_id', requestedWorkOrderId)"));
  assert.match(queue, /isFluidClosureDeclarationCurrent/);
  assert.match(close, /isFluidClosureDeclarationCurrent/);
});
