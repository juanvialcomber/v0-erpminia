import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const timerRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/timer/route.ts','utf8');
const workOrderRoute = fs.readFileSync('app/api/maintenance/work-orders/[id]/route.ts','utf8');
const myWorkRoute = fs.readFileSync('app/api/maintenance/my-work/route.ts','utf8');
const priority = fs.readFileSync('lib/maintenance/my-work-priority.mjs','utf8');
const mobile = fs.readFileSync('components/maintenance/mobile-work-order-flow.tsx','utf8');
const migration = fs.readFileSync('supabase/migrations/20261109173000_unique_running_timer_per_person.sql','utf8');

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

test('switching work pauses the previous OT and starts or resumes the selected OT', () => {
  assert.match(mobile, /action: 'pause'/);
  assert.match(mobile, /status !== 'in_progress'/);
  assert.match(mobile, /JSON\.stringify\(\{ status: 'in_progress' \}\)/);
  assert.match(mobile, /timerStatus === 'paused'/);
  assert.match(mobile, /JSON\.stringify\(\{ action: 'resume' \}\)/);
  assert.match(mobile, /timerStatus === 'idle'/);
  assert.match(mobile, /JSON\.stringify\(\{ action: 'play' \}\)/);
  assert.match(mobile, /Pausar OT actual e iniciar esta/);
});
