import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(new URL('../components/maintenance/control-tower-screen.tsx', import.meta.url), 'utf8');
const stopped = source.slice(source.indexOf('function StoppedSlide('), source.indexOf('function PreventiveSlide('));

test('zero stoppages use a calm favorable signal, without claiming all assets are operating', () => {
  assert.match(stopped, /rows\.length === 0/);
  assert.match(stopped, /stoppedAssets === 0/);
  assert.match(stopped, /Sin detenciones vigentes reportadas/);
  assert.match(stopped, /Indicador favorable para la continuidad operacional, según las fuentes disponibles/);
  assert.match(stopped, /CheckCircle2/);
});

test('unknown coverage remains neutral and is not silently treated as zero', () => {
  assert.match(stopped, /Sin datos suficientes/);
  assert.match(stopped, /No hay evidencia suficiente para confirmar el estado de detenciones/);
  assert.match(stopped, /role="status"/);
});
