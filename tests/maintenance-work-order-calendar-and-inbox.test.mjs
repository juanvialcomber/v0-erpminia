import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import {
  chileTodayDateKey, normalizeWorkOrderDateKey, formatWorkOrderDate,
  daysUntilWorkOrderDate, isWorkOrderScheduledOverdue,
} from '../lib/maintenance/work-order-calendar-date.mjs';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('OT 16 October remains 16 October in Chile; 15 October is today, not the deadline', () => {
  assert.equal(formatWorkOrderDate('2026-10-16'), '16-10-2026');
  assert.equal(formatWorkOrderDate('2026-10-16', 'en-US'), '10/16/2026');
  assert.equal(daysUntilWorkOrderDate('2026-10-16', '2026-10-15'), 1);
  assert.equal(isWorkOrderScheduledOverdue('2026-10-16', '2026-10-15'), false);
  assert.equal(daysUntilWorkOrderDate('2026-10-15', '2026-10-15'), 0);
  assert.equal(daysUntilWorkOrderDate('2026-10-14', '2026-10-15'), -1);
  assert.equal(isWorkOrderScheduledOverdue('2026-10-14', '2026-10-15'), true);
});

test('pure work-order calendar dates survive Santiago time zone and DST transitions', () => {
  const code = `import {formatWorkOrderDate,daysUntilWorkOrderDate} from ${JSON.stringify(new URL('../lib/maintenance/work-order-calendar-date.mjs', import.meta.url).href)};
    process.stdout.write(JSON.stringify({
      native:new Date('2026-10-16').toLocaleDateString('es-CL'),
      fixed:formatWorkOrderDate('2026-10-16'),
      diff:daysUntilWorkOrderDate('2026-10-16','2026-10-15'),
      winter:daysUntilWorkOrderDate('2026-04-06','2026-04-05'),
      summer:daysUntilWorkOrderDate('2026-09-07','2026-09-06')
    }));`;
  const proc = spawnSync(process.execPath, ['--input-type=module', '-e', code], {
    env: { ...process.env, TZ: 'America/Santiago' }, encoding: 'utf8',
  });
  assert.equal(proc.status, 0, proc.stderr);
  assert.deepEqual(JSON.parse(proc.stdout), {
    native: '15-10-2026', fixed: '16-10-2026', diff: 1, winter: 1, summer: 1,
  });
});

test('strict calendar validation and Chile civil day independent of UTC', () => {
  assert.equal(normalizeWorkOrderDateKey('2026-02-29'), null);
  assert.equal(normalizeWorkOrderDateKey('2026-10-16T00:00:00'), '2026-10-16');
  assert.equal(normalizeWorkOrderDateKey('2026-10-16'), '2026-10-16');
  assert.equal(normalizeWorkOrderDateKey('bad-date'), null);
  assert.equal(chileTodayDateKey(new Date('2026-10-16T01:30:00Z')), '2026-10-15');
});

test('date-only UI avoids UTC midnight and shows exact planned date', () => {
  const create = read('components/maintenance/create-work-order.tsx');
  const detail = read('components/maintenance/work-order-detail.tsx');
  const queue = read('components/maintenance/work-orders-queue.tsx');
  const schedule = read('components/maintenance/maintenance-schedule.tsx');
  assert.match(create, /scheduledDate'.*chileTodayDateKey\(\)/);
  assert.match(detail, /formatWorkOrderDate\(workOrder.scheduled_date, dateLocale\)/);
  assert.doesNotMatch(detail, /new Date\(workOrder.scheduled_date\)/);
  assert.match(queue, /isWorkOrderScheduledOverdue\(order.scheduled_date\)/);
  assert.match(queue, /daysUntilWorkOrderDate\(order.scheduled_date\)/);
  assert.doesNotMatch(queue, /new Date\(order.scheduled_date/);
  assert.match(schedule, /Programada: \{formatWorkOrderDate\(schedule.nextScheduledDate\)\}/);
  assert.match(schedule, /daysUntil === 0.*Hoy/);
  assert.match(schedule, /daysUntil === 1.*Mañana/);
});

test('execution/print registry and executive maintenance summary keep exact OT calendar days', () => {
 const registry=read('components/maintenance/work-order-execution-panel.tsx');
 const dashboard=read('components/maintenance/maintenance-executive-dashboard.tsx');
 assert.match(registry,/formatWorkOrderDate\(value\) \|\| 'Sin fecha'/);
 assert.match(registry,/dateLabel\(workOrder.scheduled_date\)/);
 assert.doesNotMatch(registry,/new Date\(value\).toLocaleDateString/);
 assert.match(dashboard,/isWorkOrderScheduledOverdue\(order.scheduled_date\)/);
 assert.match(dashboard,/formatWorkOrderDate\(order.scheduled_date\)/);
 assert.doesNotMatch(dashboard,/new Date\(order.scheduled_date\)/);
});

test('Joaquin assigned orders and Ariel follow-up/approval flow reach Mis tareas', () => {
  const api = read('app/api/actions/inbox/route.ts');
  const source = read('lib/maintenance/personal-work-order-inbox.ts');
  const ui = read('components/actions/actions-inbox.tsx');
  assert.match(api, /loadPersonalMaintenanceTasks\(context, profile.cargo_id, cargoName/);
  assert.match(api, /personalWorkOrderTasks.length === 0/);
  assert.match(api, /\.\.\.personalWorkOrderTasks/);
  assert.match(api, /coverageMissing/);
  assert.match(source, /\.eq\('organization_id', context.organizationId\)/);
  assert.match(source, /\.eq\('assigned_person_id', person.id\)/);
  assert.match(source, /\.eq\('created_by', context.authUserId \|\| context.userId\)/);
  assert.match(source, /workshopHeadCanAccessOrder\(workshop, order\)/);
  assert.match(source, /work_order_supervisor_reviews/);
  assert.match(source, /\['Ariel López', 'Mauricio Astudillo'\]/);
  assert.match(source, /if \(!reviewed.has\(order.id\)\)/);
  assert.match(source, /tasks.set\(order.id, toInboxTask/);
  assert.doesNotMatch(source, /\.insert\(|\.upsert\(|\.delete\(/);
  assert.match(ui, /key === 'workOrder'/);
  assert.match(queueWithAllFilter(), /viewFilter === 'all'/);
});

function queueWithAllFilter() {
  return read('components/maintenance/work-orders-queue.tsx');
}


test('overdue active work orders remain visible in current operational calendar', () => {
  const calendar = read('components/operational-calendar/comfortable-operational-calendar.tsx');
  assert.match(calendar, /item\.overdue\s*\? today\s*: item\.date/);
  assert.match(calendar, /const rawEnd = item\.historical[\s\S]*item\.overdue[\s\S]*\? today/);
});
