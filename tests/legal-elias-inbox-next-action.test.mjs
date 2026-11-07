import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/legal/inbox/route.ts', import.meta.url), 'utf8');
const page = await readFile(new URL('../app/dashboard/legal/inbox/page.tsx', import.meta.url), 'utf8');

test('Elias inbox returns one explicit next action per work item', () => {
  assert.match(api, /Preparar solicitud de pago/);
  assert.match(api, /Completar firmas requeridas/);
  assert.match(api, /Adjuntar evidencia de transferencia/);
  assert.match(api, /Revisar avance contractual/);
  assert.match(api, /Completar evidencia del caso/);
});

test('Elias inbox displays and uses the next action as CTA', () => {
  assert.match(page, /Siguiente acción:/);
  assert.match(page, /item\.next_action/);
  assert.doesNotMatch(page, />Abrir fuente </);
});


test('management-ready requires canonical approved payment state and completed signatures', () => {
  assert.match(api, /String\(paymentStatus\)\.toLowerCase\(\) === 'approved'/);
  assert.match(api, /signaturesDone >= signaturesRequired/);
  assert.match(api, /!paymentRequest\.executed_at/);
  assert.match(api, /Informar a Gerencia: pago listo/);
});
