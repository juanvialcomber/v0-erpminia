import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync('app/dashboard/finanzas/pagos/page.tsx','utf8');
const route = fs.readFileSync('app/api/finance/payables/route.ts','utf8');

test('treasury exposes one explicit next action',()=>{
  assert.match(page,/Siguiente acción/);
  assert.match(page,/Definir vencimiento/);
  assert.match(page,/Registrar pago vencido/);
  assert.match(page,/Conciliar pago/);
  assert.match(page,/Sin CxP MOTIL pendientes/);
});

test('treasury replaces browser prompts with traceable dialogs',()=>{
  assert.doesNotMatch(page,/window\.prompt/);
  assert.match(page,/Referencia de pago/);
  assert.match(page,/Referencia de conciliación/);
  assert.match(page,/Notas de conciliación/);
  assert.match(page,/Confirmar conciliación/);
});

test('treasury keeps currencies separate and uses Chile local payment date',()=>{
  assert.match(page,/outstandingByCurrency/);
  assert.match(page,/money\(value,currency\)/);
  assert.match(page,/America\/Santiago/);
  assert.doesNotMatch(page,/new Date\(\)\.toISOString\(\)\.slice\(0,10\)/);
});

test('treasury mutations still use tenant safe finance API',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/set_supplier_payable_due_date_v2/);
  assert.match(route,/record_supplier_payment_v2/);
  assert.match(route,/reconcile_supplier_payment_v2/);
  assert.match(route,/p_organization_id: context\.organizationId/);
});
