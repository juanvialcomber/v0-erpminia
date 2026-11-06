import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const mobile = await readFile(new URL('../components/maintenance/mobile-work-order-flow.tsx', import.meta.url), 'utf8');

test('in-progress idle OT distinguishes resumed work from pending closure', () => {
  assert.match(mobile, /timerAction\(action: 'play' \| 'pause' \| 'resume'/);
  assert.match(mobile, /timerStatus === 'idle'/);
  assert.match(mobile, /timerAction\('play'\)/);
  assert.match(mobile, /Tiempo detenido/);
  assert.match(mobile, /Continuar al cierre/);
  assert.match(mobile, /baseSeconds > 0/);
});

test('running OT exposes pause flow and paused OT resumes', () => {
  assert.match(mobile, /timerStatus === 'running' && !showPauseForm/);
  assert.match(mobile, /Pausar trabajo/);
  assert.match(mobile, /Motivo de pausa/);
  assert.match(mobile, /timerAction\('resume'\)/);
});
