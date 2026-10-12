import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const page = readFileSync(new URL('../app/dashboard/notificaciones/prueba/page.tsx', import.meta.url), 'utf8');

test('receipt review never claims delivery from a status refresh alone', () => {
  assert.match(page, /No hay pruebas de envío registradas/);
  assert.match(page, /Esta consulta no envía una prueba nueva/);
  assert.match(page, /sin recepción confirmada por el navegador/);
  assert.match(page, /banner de Windows sin verificar/);
  assert.doesNotMatch(page, /Recepción actualizada\. Un aviso creado/);
});
