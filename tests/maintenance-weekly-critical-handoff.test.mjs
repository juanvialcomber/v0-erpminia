import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildAssignedWorkActions } from '../lib/maintenance/my-work-priority.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const canonical = (id, priority, scheduledDate, timerStatus = 'idle', status = 'open') => ({
  id,
  work_order_number: 'OT-' + id,
  title: 'Trabajo ' + id,
  priority,
  scheduled_date: scheduledDate,
  status,
  timer_status: timerStatus,
  created_at: '2026-10-15T09:00:00Z',
});

test('future assigned work stays visible alongside overdue and current work', () => {
  const rows = [
    canonical('older', 'high', '2026-10-14'),
    canonical('next-week', 'medium', '2026-10-22'),
    canonical('tomorrow', 'low', '2026-10-16'),
    canonical('today', 'high', '2026-10-15', 'running', 'in_progress'),
    canonical('finished', 'critical', '2026-10-13', 'idle', 'completed'),
  ];
  const actions = buildAssignedWorkActions(rows, '2026-10-15');
  assert.equal(actions.length, 4);
  assert.deepEqual(actions.map((action) => action.id), ['today', 'older', 'next-week', 'tomorrow']);
  assert.equal(actions.find((action) => action.id === 'next-week')?.daysUntil, 7);
  assert.equal(actions.find((action) => action.id === 'tomorrow')?.daysUntil, 1);
  assert.equal(actions.find((action) => action.id === 'today')?.isRunning, true);
  assert.match(actions.find((action) => action.id === 'next-week')?.evidence || '', /22-10-2026/);
});

test('new critical work is recommended ahead of current high priority work; choice is not mutated', () => {
  const rows = [
    canonical('active', 'high', '2026-10-15', 'running', 'in_progress'),
    canonical('urgent', 'critical', '2026-10-21'),
    canonical('lower', 'low', null),
    canonical('urgent-old', 'critical', '2026-10-19'),
  ];
  const frozen = JSON.stringify(rows);
  const actions = buildAssignedWorkActions(rows, '2026-10-15');
  assert.deepEqual(actions.map((item) => item.id), ['urgent-old', 'urgent', 'active', 'lower']);
  assert.equal(actions[0].isCritical, true);
  assert.equal(actions[2].isRunning, true);
  assert.equal(actions[1].daysUntil, 6);
  assert.equal(JSON.stringify(rows), frozen);
});

test('historical and terminal OT do not show as executable; paused OT remains selectable', () => {
  const actions = buildAssignedWorkActions([
    canonical('done', 'critical', '2026-10-01', 'idle', 'completed'),
    canonical('cancel', 'critical', '2026-10-01', 'idle', 'cancelled'),
    canonical('paused', 'high', '2026-10-16', 'paused', 'in_progress'),
  ], '2026-10-15');
  assert.deepEqual(actions.map((action) => action.id), ['paused']);
  assert.equal(actions[0].isPaused, true);
  assert.equal(actions[0].isRunning, false);
});

test('the API scopes to authenticated assignee and returns all active dates with a bounded query', () => {
  const api = read('app/api/maintenance/my-work/route.ts');
  assert.match(api, /requireModuleAccess\(request, MODULE_KEYS.MANT_OPERACIONES\)/);
  assert.match(api, /\.eq\('organization_id', context.organizationId\)/);
  assert.match(api, /\.eq\('assigned_person_id', person.id\)/);
  assert.match(api, /\.in\('status', \['open', 'assigned', 'pending', 'planned', 'in_progress'\]\)/);
  assert.match(api, /\.limit\(200\)/);
  assert.doesNotMatch(api, /\.lte\('scheduled_date'/);
  assert.match(api, /buildAssignedWorkActions\(rows \|\| \[\], chileTodayDateKey\(\)\)/);
});

test('critical suggestion never silently pauses work; changing active OT requires a human comment', () => {
  const home = read('components/maintenance/mobile-terrain-panel.tsx');
  const detail = read('components/maintenance/mobile-work-order-flow.tsx');
  const timer = read('app/api/maintenance/work-orders/[id]/timer/route.ts');
  const status = read('app/api/maintenance/work-orders/[id]/route.ts');
  assert.match(home, /actions\.map\(\(action\) =>/);
  assert.doesNotMatch(home, /actions\?\.\[0\]/);
  assert.match(home, /refreshInterval: 30_000/);
  assert.match(home, /toast.warning/);
  assert.match(detail, /runningElsewhere/);
  assert.match(detail, /switchComment\.trim\(\)/);
  assert.match(detail, /comment\.length < 5/);
  assert.match(detail, /action: 'pause'/);
  assert.match(detail, /await refreshAssignedWork\(\)/);
  assert.match(detail, /'Entró una OT más crítica'/);
  assert.match(detail, /toast.warning/);
  assert.match(timer, /findOtherRunningWorkOrder\(context, workOrderId\)/);
  assert.match(status, /findOtherRunningWorkOrder\(context, id\)/);
  assert.match(timer, /if \(action === 'pause' && !notes\)/);
  assert.match(timer, /status: 409/);
  assert.doesNotMatch(home, /\/timer/);
});

test('calendar opens on the current work week, not the previous ten days', () => {
  const calendar = read('components/operational-calendar/comfortable-operational-calendar.tsx');
  assert.match(calendar, /startOfChileanWorkWeek\(today\)/);
  assert.doesNotMatch(calendar, /anchorDate \|\| addDays\(today, -10\)/);
});
