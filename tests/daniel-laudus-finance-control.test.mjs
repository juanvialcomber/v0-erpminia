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


test('pending Laudus payments are shown as source-state cases, not inferred debt', () => {
  assert.match(loader, /pendingItems/);
  assert.match(card, /Estado fuente Laudus: “no depositado”/);
  assert.match(card, /MOTIL no lo interpreta automáticamente como deuda, error bancario ni pago pendiente/);
  assert.match(card, /Monto no informado/);
});


test('finance headline does not claim no urgency when only invoice review is empty', () => {
  assert.match(page, /Sin facturas prioritarias en revisión/);
  assert.match(page, /Sin facturas prioritarias/);
  assert.doesNotMatch(page, /Sin decisiones urgentes en la muestra actual/);
});


test('Laudus payables control is bounded and keeps source-state semantics', () => {
  assert.match(loader, /laudus_accounts_payable_service_v1/);
  assert.match(loader, /oldestOpenItems/);
  assert.match(loader, /not reconciled cash commitment or final accounting liability/);
  assert.match(card, /CxP Laudus que requiere revisión/);
  assert.match(card, /Ordenado por vencimiento más antiguo/);
  assert.match(card, /MOTIL no suma estos saldos como caja comprometida ni deuda final/);
});
