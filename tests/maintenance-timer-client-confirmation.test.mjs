import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const mobile = await readFile(new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url), 'utf8');
const desktop = await readFile(new URL('../components/maintenance/work-order-timer.tsx', import.meta.url), 'utf8');

test('terrain timer actions require the server to confirm the expected persisted state', () => {
  assert.match(mobile, /assertTimerTransition/);
  assert.match(mobile, /action === 'pause' \? 'paused' : action === 'terminate' \? 'idle' : 'running'/);
  assert.match(mobile, /El servidor no confirmó el estado del cronómetro/);
  assert.match(mobile, /assertTimerTransition\('play', timerResult\)/);
  assert.match(mobile, /assertTimerTransition\(action, timerResult\)/);
  assert.match(mobile, /assertTimerTransition\('terminate', timerResult\)/);
});

test('desktop timer does not report success when the server returns an unexpected state', () => {
  assert.match(desktop, /expectedStatus = action === 'pause' \? 'paused' : action === 'terminate' \? 'idle' : 'running'/);
  assert.match(desktop, /payload\?\.timer_status !== expectedStatus/);
  assert.match(desktop, /El servidor no confirmó el estado del cronómetro/);
});
