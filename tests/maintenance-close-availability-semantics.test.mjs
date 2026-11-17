import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync(
  'app/api/maintenance/work-orders/[id]/close/route.ts',
  'utf8',
);

test('work-order close never derives downtime from wall-clock elapsed time', () => {
  assert.doesNotMatch(route, /Date\.now\(\) - startTime\.getTime\(\)/);
  assert.doesNotMatch(route, /down_time_hours:\s*downtime/);
});

test('work-order close does not write inferred equipment availability', () => {
  assert.doesNotMatch(route, /from\('equipment_availability'\)\.upsert/);
  assert.match(route, /availability_status:\s*'insufficient_evidence'/);
  assert.match(route, /availability_percentage:\s*null/);
});

test('single work-order duration is not published as MTTR', () => {
  assert.match(route, /actual_duration_hours:\s*effectiveHours/);
  assert.match(route, /mttr:\s*null/);
});
