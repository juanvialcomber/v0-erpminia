import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/maintenance/control-tower-screen.tsx', import.meta.url), 'utf8');

test('no stopped vehicles is an informative neutral state, not an error', () => {
  const stopped = source.slice(source.indexOf('function StoppedSlide('), source.indexOf('function PreventiveSlide('));
  assert.match(stopped, /rows\.length === 0/);
  assert.match(stopped, /stoppedAssets === 0 \? '0 detenciones reportadas'/);
  assert.match(stopped, /Esto no confirma que toda la flota esté operativa/);
  assert.match(stopped, /Sin datos de detenciones confirmadas/);
  assert.match(stopped, /role="status"/);
  assert.doesNotMatch(stopped, /border-dashed/);
});
