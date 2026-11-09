import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const timerRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/timer/route.ts','utf8');
const workOrderRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/route.ts','utf8');
const myWorkRoute = fs.readFileSync('app/api/maintenance/my-work/route.ts','utf8');
const priority = fs.readFileSync('lib/maintenance/my-work-priority.mjs','utf8');
const mobile = fs.readFileSync('components/maintenance/mobile-work-order-flow.tsx','utf8');
const migration = fs.readFileSync('supabase/migrations/20261109173000_unique_running_timer_per_person.sql','utf8');
const switchRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/switch/route.ts','utf8');
const organizationContext = fs.readFileSync('lib/api/organization-context.ts','utf8');

test('database enforces one running timer per canonical assignee', () => {
  assert.match(migration, /create unique index if not exists maintenance_work_orders_one_running_timer_per_person_uidx/);
  assert.match(migration, /organization_id, assigned_person_id/);
  assert.match(migration, /where timer_status = 'running'/);
  assert.match(timerRoute, /error\?\.code === '23505'/);
  assert.match(timerRoute, /Ya existe otra OT registrando tiempo/);
});

test('concurrency responses expose the timer start evidence', () => {
  assert.match(timerRoute, /concurrentTimerStartedAt: other\.timer_start_time/);
  assert.match(workOrderRoute, /concurrentTimerStartedAt: other\.timer_start_time/);
});

test('assigned work exposes running timer age to terrain UI', () => {
  assert.match(myWorkRoute, /timer_status,timer_start_time,total_timer_minutes/);
  assert.match(priority, /timerStartedAt: row\.timer_start_time/);
  assert.match(mobile, /runningElsewhereAgeSeconds/);
  assert.match(mobile, /runningElsewherePossiblyStale/);
  assert.match(mobile, /más de 12 horas activo/);
  assert.match(mobile, /MOTIL no corregirá horas automáticamente/);
});

test('switching work is one server-side atomic handoff', () => {
  assert.match(mobile, /\/api\/maintenance\/work-orders\/\$\{workOrderId\}\/switch/);
  assert.match(mobile, /fromWorkOrderId: runningElsewhere\.id/);
  assert.match(mobile, /Pausar OT actual e iniciar esta/);
  assert.match(switchRoute, /switch_work_order_timer/);
  assert.match(switchRoute, /requireAssignedMaintenanceExecution\(context, fromWorkOrderId\)/);
  assert.match(switchRoute, /requireAssignedMaintenanceExecution\(context, targetWorkOrderId\)/);
  assert.match(switchRoute, /getWorkOrderReleaseReadiness/);
  assert.match(migration, /create or replace function public\.switch_work_order_timer/);
  assert.match(migration, /for update/);
  assert.match(migration, /'timer_pause'/);
  assert.match(migration, /v_to_event := case when/);
  assert.match(migration, /grant execute on function public\.switch_work_order_timer/);
});


test('technicians can reach the narrow assigned switch endpoint without gaining broad maintenance write access', () => {
  assert.match(organizationContext, /timer\|switch\|close\|evidence\|standard-plan\|offline-notes\|fluids/);
  assert.match(organizationContext, /maintenanceWriteRoles/);
});

test('switch route scopes the body-supplied source OT for workshop heads', () => {
  assert.match(switchRoute, /resolveWorkshopHeadScope\(context\)/);
  assert.match(switchRoute, /workshopHeadCanAccessOrder\(workshop, sourceOrder\)/);
  assert.match(switchRoute, /OT actual fuera de tu faena/);
});

test('atomic handoff rechecks start readiness while target row is locked', () => {
  assert.match(migration, /for update/);
  assert.match(migration, /v_to\.work_type/);
  assert.match(migration, /v_to\.canonical_asset_id is null/);
  assert.match(migration, /v_to\.scheduled_date is null/);
  assert.match(migration, /falta activo canónico/);
  assert.match(migration, /falta fecha programada/);
});

test('migration fails explicitly if duplicate running timers already exist', () => {
  assert.match(migration, /having count\(\*\) > 1/);
  assert.match(migration, /Cannot install timer invariant: duplicate running timers exist/);
});
