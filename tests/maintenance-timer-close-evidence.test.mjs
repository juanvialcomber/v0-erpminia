import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const mobile = await readFile(new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url), 'utf8');
const desktop = await readFile(new URL('../components/maintenance/work-order-timer.tsx', import.meta.url), 'utf8');
const timerRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/timer/route.ts', import.meta.url), 'utf8');
const closeRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/close/route.ts', import.meta.url), 'utf8');
const closeQueue = await readFile(new URL('../components/maintenance/progressive-work-order-close-queue.tsx', import.meta.url), 'utf8');
const evidenceRoute = await readFile(new URL('../app/api/maintenance/work-orders/[id]/evidence/route.ts', import.meta.url), 'utf8');
const migration = await readFile(new URL('../supabase/migrations/20261005193000_work_order_timer_seconds_and_closure_evidence.sql', import.meta.url), 'utf8');

test('OT timer keeps second precision in database and APIs', () => {
  assert.match(migration, /total_timer_seconds integer not null default 0/);
  assert.match(migration, /extract\(epoch from \(v_now - v_new_start\)\)/);
  assert.match(timerRoute, /total_timer_seconds/);
  assert.match(timerRoute, /total_seconds: totalSeconds/);
});

test('mobile and desktop timers visibly tick every second', () => {
  assert.match(mobile, /setInterval\(\(\) => setNowMs\(Date\.now\(\)\), 1000\)/);
  assert.match(mobile, /runningSeconds/);
  assert.match(mobile, /duration\(displaySeconds\)/);
  assert.match(desktop, /liveSeconds/);
  assert.match(desktop, /String\(seconds\)\.padStart\(2, '0'\)/);
});

test('closure UI requires a camera or image evidence and uses dedicated close endpoint', () => {
  assert.doesNotMatch(closeQueue, /capture="environment"/);
  assert.match(closeQueue, /accept="image\/jpeg,image\/png,image\/webp,image\/heic,image\/heif"/);
  assert.match(closeQueue, /uploadEvidence/);
  assert.match(closeQueue, /Agregar fotos/);
  assert.match(closeQueue, /multiple/);
  assert.match(closeQueue, /fallbackForm = new FormData\(\)/);
  assert.match(closeQueue, /fallbackForm\.append\('file', file\)/);
  assert.match(closeQueue, /evidenceCount/);
  assert.match(closeQueue, /\/evidence/);
  assert.match(closeQueue, /\/close/);
  assert.doesNotMatch(closeQueue, /patchCurrent\(\{ status:'completed'/);
});

test('server stores private photo evidence and blocks closure without it', () => {
  assert.match(migration, /work_order_evidence_files/);
  assert.match(migration, /maintenance-work-order-evidence/);
  assert.match(migration, /revoke all on table public\.work_order_evidence_files from anon, authenticated/);
  assert.match(evidenceRoute, /ALLOWED_TYPES/);
  assert.match(evidenceRoute, /12 \* 1024 \* 1024/);
  assert.match(closeRoute, /work_order_evidence_files/);
  assert.match(closeRoute, /evidence_type', 'photo'/);
  assert.match(closeRoute, /Agrega al menos una foto como evidencia/);
});

test('dedicated closure terminates a running or paused timer before final close', () => {
  assert.match(closeRoute, /\['running', 'paused'\]/);
  assert.match(closeRoute, /p_action: 'terminate'/);
  assert.match(closeRoute, /close_work_order_safely/);
});


test('closure uses one atomic timer-aware RPC and never promotes wall-clock elapsed time to active duration', async () => {
  const atomicMigration = await readFile(new URL('../supabase/migrations/20261105195000_atomic_work_order_close_timer_v2.sql', import.meta.url), 'utf8');
  assert.match(closeRoute, /close_work_order_with_timer_v2/);
  assert.doesNotMatch(closeRoute, /Date\.now\(\) - startTime\.getTime\(\)/);
  assert.doesNotMatch(closeRoute, /equipment_availability/);
  assert.doesNotMatch(closeRoute, /availabilityPercent/);
  assert.match(closeRoute, /availability_state: 'not_derived_from_work_order_close'/);

  assert.match(atomicMigration, /perform public\.update_work_order_timer\(/);
  assert.match(atomicMigration, /perform public\.close_work_order_safely\(p_work_order_id\)/);
  assert.match(atomicMigration, /v_effective_hours := greatest\(v_timer_hours, v_requested_hours\)/);
  assert.doesNotMatch(atomicMigration, /start_date/);
  assert.doesNotMatch(atomicMigration, /24 \* 60/);
});

test('failed safe close rolls back timer termination and closure detail mutation in the same database call', async () => {
  const atomicMigration = await readFile(new URL('../supabase/migrations/20261105195000_atomic_work_order_close_timer_v2.sql', import.meta.url), 'utf8');
  const terminateIndex = atomicMigration.indexOf("perform public.update_work_order_timer(");
  const updateIndex = atomicMigration.indexOf("update public.maintenance_work_orders");
  const closeIndex = atomicMigration.indexOf("perform public.close_work_order_safely(p_work_order_id)");
  assert.ok(terminateIndex >= 0 && updateIndex > terminateIndex && closeIndex > updateIndex);
  assert.match(atomicMigration, /Any exception raised there aborts this entire function call/);
  assert.match(atomicMigration, /begin;/);
  assert.match(atomicMigration, /commit;/);
});
