import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { extractClockReviewRefs, summarizeClockReview } from '../lib/maintenance/ot-hours-review.mjs';

const task = {
  status: 'open',
  detail: 'Revision: OT-2099-0001, OTE-2099-0002, OTE-2099-0003 y OT-2099-0004.',
};
const orders = [
  { id: 'id-1', work_order_number: 'OT-2099-0001', status: 'completed', timer_status: 'idle', actual_duration_hours: null, planned_duration_hours: 3 },
  { id: 'id-2', work_order_number: 'OTE-2099-0002', status: 'completed', timer_status: 'idle', actual_duration_hours: null, planned_duration_hours: 5 },
  { id: 'id-3', work_order_number: 'OTE-2099-0003', status: 'in_progress', timer_status: 'paused', timer_start_time: null, total_timer_seconds: 0 },
  { id: 'id-4', work_order_number: 'OT-2099-0004', status: 'completed', timer_status: 'idle', actual_duration_hours: 16.035, planned_duration_hours: 0 },
];
const events = [
  { work_order_id: 'id-1', event_type: 'pilot_weekday_duration_calculated', event_at: '2099-11-22T10:00:00Z', payload: { status: 'PROVISIONAL', pending_mechanic_confirmation: true, estimated_weekday_seconds: 76036 } },
  { work_order_id: 'id-2', event_type: 'pilot_weekday_duration_calculated', event_at: '2099-11-22T10:00:00Z', payload: { status: 'PROVISIONAL', pending_mechanic_confirmation: true, estimated_weekday_seconds: 73746 } },
  { work_order_id: 'id-3', event_type: 'timer_safety_paused', event_at: '2099-11-22T10:00:00Z', payload: { reason: 'weekend_stale_timer' } },
  { work_order_id: 'id-4', event_type: 'timer_play', event_at: '2099-11-02T10:00:00Z', payload: null },
  { work_order_id: 'id-4', event_type: 'timer_terminate', event_at: '2099-11-03T02:02:00Z', payload: null },
];
const run = (change = {}) => summarizeClockReview({ task, workOrders: orders, events, eventsComplete: true, ...change });

test('one review uses all four source-grounded cases, not four new tasks', () => {
  const result = run();
  assert.equal(result.assigned, true);
  assert.equal(result.state, 'needs_review');
  assert.equal(result.totalCases, 4);
  assert.deepEqual(result.items.map(x => x.kind),
    ['safety_pause', 'pilot_estimate', 'pilot_estimate', 'continuous_span']);
  assert.equal(result.items.find(x => x.number === 'OT-2099-0001').description.includes('21 h 07 min'), true);
  assert.equal(result.items.find(x => x.number === 'OTE-2099-0002').description.includes('20 h 29 min'), true);
  assert.equal(result.items.every(x => x.nextAction.startsWith('Ariel')), true);
  assert.equal(result.noAutomaticDurationUpdate, true);
  assert.equal(result.noMechanicWorkflowChange, true);
});

test('pilot estimates disappear from review when effective work hours are verified', () => {
  const modified = orders.map(x => x.id === 'id-1' ? { ...x, actual_duration_hours: 5 } : x);
  const result = run({ workOrders: modified });
  assert.equal(result.totalCases, 3);
  assert.equal(result.items.some(x => x.number === 'OT-2099-0001'), false);
});

test('the safety pause ceases to be pending after authorized resume', () => {
  const modified = orders.map(x => x.id === 'id-3' ? { ...x, timer_status: 'running', timer_start_time: '2099-11-23T08:00:00Z' } : x);
  const result = run({ workOrders: modified });
  assert.equal(result.items.some(x => x.number === 'OTE-2099-0003'), false);
});

test('continuous-span review requires start, end and no intervening pauses', () => {
  const result = run({ events: [...events, { work_order_id: 'id-4', event_type: 'timer_pause', event_at: '2099-11-02T18:00:00Z', payload: null }] });
  assert.equal(result.items.some(x => x.kind === 'continuous_span'), false);
  assert.equal(result.totalCases, 3);
});

test('a long shift is not falsely treated as confirmed time corruption', () => {
  const result = run();
  const target = result.items.find(x => x.kind === 'continuous_span');
  assert.match(target.description, /indicio a investigar, no un error demostrado/);
  assert.match(target.nextAction, /No rectificar sin evidencia/);
});

test('unknown OT and incomplete event coverage fail safely', () => {
  const incomplete = run({ eventsComplete: false });
  assert.equal(incomplete.state, 'partial');
  assert.equal(incomplete.totalCases, 0);
  assert.deepEqual(incomplete.items, []);
  const missing = run({ workOrders: orders.slice(1) });
  assert.equal(missing.items.find(x => x.number === 'OT-2099-0001').kind, 'unresolved');
});

test('no task means no data, and closed tasks leave the review queue', () => {
  assert.deepEqual(run({ task: null }), { assigned: false, state: 'not_assigned', items: [], totalCases: 0 });
  assert.equal(run({ task: { ...task, status: 'done' } }).assigned, false);
});

test('OT references are strict, unique and bounded', () => {
  assert.deepEqual(extractClockReviewRefs('ot-2099-0001 OT-2099-0001 OTE-2099-0003 junk'), ['OT-2099-0001', 'OTE-2099-0003']);
  assert.equal(extractClockReviewRefs('OT-2099-0000 '.repeat(9)).length, 1);
  assert.equal(extractClockReviewRefs(Array.from({length:10},(_,i)=>'OT-2099-'+String(i).padStart(4,'0')).join(' ')).length, 8);
});

test('server route restricts the read to current assignee, org and a bounded evidence sample', () => {
  const api = readFileSync(resolve('app/api/maintenance/ot-hours-review/route.ts'), 'utf8');
  const ui = readFileSync(resolve('components/maintenance/ariel-ot-hours-review.tsx'), 'utf8');
  const home = readFileSync(resolve('components/dashboard/maintenance-home.tsx'), 'utf8');
  assert.match(api, /getOrganizationContext\(request\)/);
  assert.match(api, /canReviewMaterialAttention\(mode, access\)/);
  assert.match(api, /eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /eq\('assignee_profile_id', context\.userId\)/);
  assert.match(api, /eq\('source_reference', SOURCE_REFERENCE\)/);
  assert.match(api, /MAX_EVENTS = 240/);
  assert.match(api, /if \(orderCount > refs\.length/);
  assert.doesNotMatch(api, /\.(?:insert|delete|update|upsert|rpc)\(/);
  assert.match(ui, /Abrir tarea asignada/);
  assert.match(ui, /Los mecánicos mantienen su flujo habitual/);
  assert.match(home, /showArielCockpit \? <ArielOtHoursReview/);
});
