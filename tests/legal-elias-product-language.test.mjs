import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const payments = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');
const assistant = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');

test('Elias primary UI uses domain language instead of infrastructure terms', () => {
  assert.match(payments, /Evidencia financiera/);
  assert.match(payments, /Pago verificado/);
  assert.match(payments, /estado financiero verificado/);
  assert.doesNotMatch(payments, /Legal ↔ Laudus/);
  assert.doesNotMatch(assistant, /· SHA /);
  assert.match(assistant, /Versión registrada/);
});
