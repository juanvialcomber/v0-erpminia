import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const payments = await readFile(new URL('../app/dashboard/legal/avances-pagos/page.tsx', import.meta.url), 'utf8');
const redirectPage = await readFile(new URL('../app/dashboard/legal/asistente/page.tsx', import.meta.url), 'utf8');
const widget = await readFile(new URL('../components/intelligence/senior-assistant-widget.tsx', import.meta.url), 'utf8');
const finance = await readFile(new URL('../app/dashboard/legal/pagos-facturas/page.tsx', import.meta.url), 'utf8');
const legacyFinance = await readFile(new URL('../app/dashboard/legal/laudus/page.tsx', import.meta.url), 'utf8');

test('Elias primary UI uses domain language instead of infrastructure terms', () => {
  assert.match(payments, /Pagos y facturas/);
  assert.match(payments, /Pago verificado/);
  assert.match(payments, /Avance físico, facturación, retención y pago se mantienen separados/);
  assert.match(payments, /Trabajo preparado por MOTIL/);
  assert.doesNotMatch(payments, /Legal ↔ Laudus/);
  assert.match(finance, /Pagos y facturas/);
  assert.match(finance, /La procedencia ERP queda en segundo plano/);
  assert.doesNotMatch(finance, /Legal ↔ Laudus|Puede salir de Laudus|Sigue siendo autoridad Laudus/);
  assert.match(legacyFinance, /redirect\('\/dashboard\/legal\/pagos-facturas'\)/);
  assert.match(redirectPage,/redirect\('\/dashboard\/legal'\)/);
  assert.match(widget,/Asistente Legal MOTIL/);
  assert.doesNotMatch(widget,/· SHA /);
});
