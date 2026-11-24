import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const helper = await readFile(new URL('../lib/maintenance/other-running-work-order.ts', import.meta.url), 'utf8');
const timer = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const workOrder = await readFile(new URL('../app/api/maintenance/work-orders/[id]/route.ts', import.meta.url), 'utf8');

test('only a truly running OT blocks starting another assigned OT', () => {
  assert.match(helper, /\.eq\('timer_status', 'running'\)/);
  assert.doesNotMatch(helper, /\.eq\('timer_status', 'paused'\)/);
  assert.match(helper, /\.eq\('assigned_person_id', target\.assigned_person_id\)/);
  assert.match(helper, /\.neq\('id', workOrderId\)/);
});

test('both status start and timer play or resume use the same running-work conflict guard', () => {
  assert.match(timer, /findOtherRunningWorkOrder\(context, workOrderId\)/);
  assert.match(workOrder, /findOtherRunningWorkOrder\(context, id\)/);
});
