import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const home = await readFile(new URL('../app/dashboard/legal/page.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');
const api = await readFile(new URL('../app/api/legal/asistente/route.ts', import.meta.url), 'utf8');

test('Elias home keeps only daily work as the primary surface', () => {
  assert.match(home, /Qué necesita atención/);
  assert.match(home, /Contratos y pagos/);
  assert.match(home, /Cumplimiento mensual/);
  assert.match(home, /Herramientas y áreas de soporte/);
  assert.doesNotMatch(home, /Compliance 360 · SERNAGEOMIN/);
  assert.doesNotMatch(home, /Flujo Legal/);
});

test('Elias assistant is action-first and hides document tools behind progressive disclosure', () => {
  assert.match(assistant, /Preguntas rápidas/);
  assert.match(assistant, /¿Qué contratos requieren atención hoy\?/);
  assert.match(assistant, /¿Qué falta pagar de IO-01\?/);
  assert.match(assistant, /Conclusión, siguiente acción y evidencia/);
  assert.match(assistant, /Herramientas documentales/);
  assert.match(assistant, /<details/);
});

test('Elias assistant prompt enforces a stable operational answer order', () => {
  assert.match(api, /CONCLUSIÓN, SIGUIENTE ACCIÓN, AVANCE\/PAGO si aplica, EVIDENCIA, EXCEPCIÓN/);
  assert.match(api, /una sola acción concreta/);
  assert.match(api, /No cierres con resúmenes repetidos ni explicaciones de infraestructura/);
});
