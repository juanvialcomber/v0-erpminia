import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const layout = await readFile(new URL('../app/dashboard/legal/layout.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');
const widget = await readFile(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url), 'utf8');
const context = await readFile(new URL('../lib/intelligence/assistant-context.ts', import.meta.url), 'utf8');

test('Elias workspace primary navigation follows requested daily jobs', () => {
  assert.match(layout, /label: 'Hoy'/);
  assert.match(layout, /label: 'Contratos y pagos'/);
  assert.match(layout, /label: 'Proveedores'/);
  assert.match(layout, /label: 'Pagos y facturas'/);
  assert.match(layout, /label: 'Transportistas'/);
  assert.doesNotMatch(layout, /label: 'Asistente'/);
  assert.doesNotMatch(layout, /Evidencia financiera/);
  assert.doesNotMatch(layout, /label: 'Laudus'/);
  assert.match(layout, /Legal \/ Elías/);
});

test('Legal home surfaces Elias operational work instead of a standalone assistant', () => {
  assert.match(home, /Prioridad/);
  assert.match(home, /Máximo tres asuntos/);
  assert.match(home, /Excepciones operativas/);
  assert.match(home, /Proveedores/);
  assert.match(home, /Pagos/);
  assert.doesNotMatch(home, /Preguntar al asistente/);
  assert.doesNotMatch(home, /href="\/dashboard\/legal\/asistente"/);
});

test('Legal assistant exists only as the global floating specialist', () => {
  assert.match(assistant, /redirect\('\/dashboard\/legal'\)/);
  assert.match(widget, /endpoint: '\/api\/legal\/asistente'/);
  assert.match(widget, /Pregunta al Asistente Legal MOTIL/);
  assert.match(context, /prefixes: \['\/dashboard\/legal'\]/);
  assert.match(context, /title: 'Asistente Legal MOTIL'/);
});
