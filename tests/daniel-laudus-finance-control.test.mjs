import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/integrations/laudus/finance-control/route.ts','utf8');
const loader = fs.readFileSync('lib/integrations/laudus/finance-control.ts','utf8');
const card = fs.readFileSync('components/integrations/laudus-finance-control-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('Daniel Laudus control is finance scoped and read only', () => {
  assert.match(route, /MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(loader, /readOnly: true/);
  assert.match(loader, /motilDoesNotWriteLaudus: true/);
  assert.match(card, /Solo lectura/);
});

test('finance control separates current operational data from historical accounting', () => {
  assert.match(loader, /currentEnoughForExecutiveUse/);
  assert.match(loader, /historical accounting rows are not presented as current balances/);
  assert.match(card, /Contabilidad Laudus histórica/);
  assert.match(card, /MOTIL no los presenta como saldo contable actual/);
});

test('credit notes and reconciliation gaps keep conservative semantics', () => {
  assert.match(loader, /not savings or recovered cash/);
  assert.match(card, /documentados · no es ahorro/);
  assert.match(card, /pendientes de conciliación/);
  assert.match(card, /No se usarán para atribución ejecutiva hasta resolverlos/);
});

test('Daniel finance workspace surfaces the Laudus control block', () => {
  assert.match(page, /LaudusFinanceControlCard/);
  assert.match(page, /<LaudusFinanceControlCard \/>/);
  assert.match(card, /Qué requiere decisión/);
  assert.match(card, /Pagos por verificar/);
});
