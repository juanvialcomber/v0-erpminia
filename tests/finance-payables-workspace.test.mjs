import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827191000_add_supplier_accounts_payable_and_cash_reconciliation_v1.sql','utf8');
const treasuryMigration = fs.readFileSync('supabase/migrations/20260827191500_add_treasury_aging_alerts_and_tenant_safe_rpc_v1.sql','utf8');
const route = fs.readFileSync('app/api/finance/payables/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/pagos/page.tsx','utf8');
const layout = fs.readFileSync('app/dashboard/finanzas/layout.tsx','utf8');

test('approved supplier invoices create payable obligations without inventing due dates',()=>{
  assert.match(migration,/status='approved'/);
  assert.match(migration,/awaiting_due_date/);
  assert.match(migration,/due_date date null/);
});

test('payments cannot exceed approved balance and require due date',()=>{
  assert.match(migration,/Defina vencimiento antes de registrar pago/);
  assert.match(migration,/El pago supera el saldo aprobado/);
  assert.match(migration,/partially_paid/);
});

test('bank reconciliation is explicit and does not alter cost recognition',()=>{
  assert.match(migration,/reconciliation_reference/);
  assert.match(migration,/Pago ya conciliado/);
  assert.match(page,/La conciliación no reconoce gasto/);
});

test('finance payables API is finance-authorized and tenant scoped',()=>{
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS/);
  assert.match(route,/p_organization_id: context\.organizationId/);
  assert.match(route,/record_supplier_payment_v2/);
  assert.match(route,/reconcile_supplier_payment_v2/);
  assert.match(treasuryMigration,/organization_id=p_organization_id/);
  assert.match(treasuryMigration,/revoke execute on function public\.record_supplier_payment_v1/);
});

test('finance navigation exposes the payments workspace with honest empty states',()=>{
  assert.match(layout,/\/dashboard\/finanzas\/pagos/);
  assert.match(page,/No hay CxP pendientes en MOTIL/);
  assert.match(page,/No hay pagos registrados/);
});
