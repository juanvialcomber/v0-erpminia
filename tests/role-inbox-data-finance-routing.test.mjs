import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const inbox = await readFile(new URL('../app/api/actions/inbox/route.ts', import.meta.url), 'utf8');
const health = await readFile(new URL('../app/dashboard/calidad-datos/salud/page.tsx', import.meta.url), 'utf8');
const financeImport = await readFile(new URL('../app/dashboard/finanzas/importar/page.tsx', import.meta.url), 'utf8');

test('role inbox deep-links data health to a focused health domain', () => {
  assert.match(inbox, /kind === 'data_health'/);
  assert.match(inbox, /calidad-datos\/salud\?domain=/);
  assert.match(health, /useSearchParams/);
  assert.match(health, /Acción abierta desde Mis acciones/);
});

test('finance quality tasks route to the relevant existing finance workflows', () => {
  assert.match(inbox, /missing_cost_centers/);
  assert.match(inbox, /dashboard\/centros-costos/);
  assert.match(inbox, /zero_amount_lines/);
  assert.match(inbox, /finance.*validation|validation.*finance/s);
  assert.match(inbox, /dashboard\/finanzas\/importar\?issue=/);
  assert.match(financeImport, /Hay movimientos con monto cero/);
  assert.match(financeImport, /Revisar datos financieros/);
});
