import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const logic = await readFile(new URL('../lib/maintenance/meter-consistency.ts',import.meta.url),'utf8');
const capture = await readFile(new URL('../app/api/maintenance/runtime-readings/capture/route.ts',import.meta.url),'utf8');
const center = await readFile(new URL('../app/api/maintenance/control-center/route.ts',import.meta.url),'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261011212000_meter_review_queue.sql',import.meta.url),'utf8');

test('hour meter cannot decrease or exceed elapsed wall-clock hours', () => {
 assert.match(logic,/deltaHours < 0/);
 assert.match(logic,/deltaHours > elapsedHours \+ 1/);
 assert.match(logic,/elapsedHours <= 0/);
});
test('inconsistent readings are audited and do not update the canonical preventive input', () => {
 assert.match(capture,/checkMeterConsistency/);
 assert.match(capture,/maintenance_meter_review_queue'\)\.insert/);
 assert.match(capture,/requiresSupervisorReview: true/);
 assert.match(migration,/evidence_path text/);
 assert.match(migration,/attempted_by uuid/);
});
test('supervisors receive persistent review actions in their existing inbox', () => {
 assert.match(center,/maintenance_meter_review_queue/);
 assert.match(center,/kind: 'meter_review'/);
 assert.match(center,/pendingMeterReviews/);
});
