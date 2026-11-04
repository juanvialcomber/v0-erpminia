import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104123000_add_motil_bank_statement_intake.sql','utf8');
const route = fs.readFileSync('app/api/finance/bank-statements/route.ts','utf8');
const card = fs.readFileSync('components/finance/motil-bank-statement-intake-card.tsx','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/pagos/page.tsx','utf8');

test('MOTIL bank intake is independent from Laudus and idempotent',()=>{
  assert.match(migration,/finance_bank_statement_imports/);
  assert.match(migration,/finance_bank_statement_transactions/);
  assert.match(migration,/unique \(organization_id, source_sha256\)/);
  assert.match(migration,/reconciliation_status/);
  assert.match(route,/sourceAuthority: 'MOTIL'/);
  assert.match(route,/laudusRequired: false/);
  assert.match(route,/automaticReconciliation: false/);
});

test('bank import is bounded and does not reconcile supplier payments automatically',()=>{
  assert.match(route,/transactions\.length > 5000/);
  assert.match(route,/import_finance_bank_statement_v1/);
  assert.match(route,/automaticReconciliationExecuted: false/);
  assert.match(route,/supplierPaymentMutationExecuted: false/);
  assert.doesNotMatch(route,/reconcile_supplier_payment_v2/);
  assert.doesNotMatch(route,/record_supplier_payment_v2/);
});

test('Treasury exposes explicit bank evidence intake',()=>{
  assert.match(card,/Fuente bancaria MOTIL/);
  assert.match(card,/Laudus no es requerido/);
  assert.match(card,/ningún pago se concilia automáticamente/);
  assert.match(page,/MotilBankStatementIntakeCard/);
});
