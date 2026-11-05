import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';
import { resolveRecordedWorkHours } from '../lib/maintenance/recorded-work-time.mjs';

const closeRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url), 'utf8');
const timerRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const mobile = await readFile(new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261105123000_pause_overlong_work_order_timer_for_review.sql', import.meta.url), 'utf8');

test('overnight pause does not count calendar downtime as worked hours', () => {
  // OT-2026-0050: 2h 26m 31s confirmed at end of shift, then resumed next morning.
  const worked = resolveRecordedWorkHours({
    totalTimerSeconds: 8791,
    totalTimerMinutes: 146,
    manualHours: 0,
    storedHours: 2.4419444444,
  });
  assert.equal(worked, 8791 / 3600);
  assert.notEqual(worked, 17);
  assert.doesNotMatch(closeRoute, /effectiveHours = Math\.max\([\s\S]*downtime/);
  assert.match(closeRoute, /resolveRecordedWorkHours\(/);
});

test('verified timer seconds are the source of worked time, not manual or stale hours', () => {
  assert.equal(resolveRecordedWorkHours({ totalTimerSeconds: 3600, totalTimerMinutes: 60, manualHours: 17, storedHours: 17 }), 1);
  assert.equal(resolveRecordedWorkHours({ totalTimerSeconds: 3599, totalTimerMinutes: 59 }), 3599 / 3600);
  assert.equal(resolveRecordedWorkHours({ manualHours: 3.25, storedHours: 5 }), 3.25);
  assert.equal(resolveRecordedWorkHours({ storedHours: 2 }), 2);
  assert.equal(resolveRecordedWorkHours({ manualHours: -99, storedHours: 0 }), 0);
});

test('overnight running sessions are paused without crediting unverified time', () => {
  assert.match(migration, /v_elapsed < 16 \* 3600/);
  assert.match(migration, /timer_status = 'paused'/);
  assert.match(migration, /timer_start_time = null/);
  assert.match(migration, /'timer_pause_review_required'/);
  assert.match(migration, /v_credited := greatest/);
  assert.match(migration, /'credited_seconds_before',v_credited/);
  assert.match(migration, /'timer_duration_declared'/);
  assert.match(migration, /'mechanic_declared_not_measured'/);
  assert.match(migration, /for update/);
  assert.match(migration, /revoke all on function public\.pause_overlong_work_order_timer_for_review/);
  assert.match(migration, /revoke all on function public\.declare_overlong_work_order_elapsed_time/);
  assert.match(migration, /to service_role/);
});

test('API blocks unsafe terminal writes and reopening an unverified timer', () => {
  assert.match(timerRoute, /action === 'pause' \|\| action === 'terminate'/);
  assert.match(timerRoute, /action === 'terminate'/);
  assert.match(timerRoute, /pause_overlong_work_order_timer_for_review/);
  assert.match(timerRoute, /declare_overlong_work_order_elapsed_time/);
  assert.match(timerRoute, /timer_pause_review_required/);
  assert.match(closeRoute, /timer_review_required: true/);
  assert.match(closeRoute, /elapsedSeconds >= 16 \* 60 \* 60/);
  assert.match(timerRoute, /Cache-Control': 'no-store'/);
});

test('mobile pause is confirmed by server before showing paused and allows reporting worked time', () => {
  assert.match(mobile, /cache: 'no-store'/);
  assert.match(mobile, /saved\?\.ok/);
  assert.match(mobile, /saved\.timer_status !== expectedStatus/);
  assert.match(mobile, /Pausar por fin de jornada/);
  assert.match(mobile, /toast\.success\('Pausa guardada'/);
  assert.match(mobile, /pendingTimerReview/);
  assert.match(mobile, /timerAction\('pause', 'Fin de jornada laboral'\)/);
  assert.match(mobile, /Registrar horas trabajadas/);
  assert.match(mobile, /disabled=\{busy \|\| Boolean\(pendingTimerReview\)\}/);
});
