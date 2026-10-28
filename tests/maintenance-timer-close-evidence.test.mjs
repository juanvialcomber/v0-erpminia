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
