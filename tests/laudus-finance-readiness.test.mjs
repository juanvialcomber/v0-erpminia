import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/finance-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/finance-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-finance-readiness-card.tsx', import.meta.url), 'utf8');

test('finance readiness measures payable and payment completeness', () => {
  assert.match(helper, /invoiceCoverage/);
  assert.match(helper, /dueDateCoverage/);
  assert.match(helper, /payableCoverage/);
  assert.match(helper, /reconciliationCoverage/);
});

test('finance readiness reads Laudus evidence with bounded aggregate counts', () => {
  assert.match(helper, /laudus_purchase_invoice_payment_status_v1/);
  assert.match(helper, /laudus_purchase_payments/);
  assert.match(helper, /count: 'exact', head: true/);
  assert.match(helper, /\.gt\('total_amount', 0\)/);
  assert.match(helper, /\.lt\('total_amount', 0\)/);
  assert.match(helper, /openDocuments: partiallyPaidDocuments \+ unpaidDocuments/);
});

test('finance readiness keeps human authority and blocks automatic payment actions', () => {
  assert.match(helper, /autoCreatePayment: false/);
  assert.match(helper, /autoReconcilePayment: false/);
  assert.match(helper, /humanApprovalRequired: true/);
  assert.match(helper, /motilPaymentApprovalRole: 'human_authority'/);
});

test('finance readiness API is finance-scoped and reads private evidence server-side', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(route, /getSupabaseServerClient/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('finance readiness UI separates MOTIL payables from Laudus evidence', () => {
  assert.match(card, /Laudus · evidencia financiera/);
  assert.match(card, /CxP canónicas MOTIL/);
  assert.match(card, /Documentos Laudus/);
  assert.match(card, /Sin creación automática de pagos/);
  assert.match(card, /ajustes\/créditos separados del saldo por pagar/);
  assert.match(card, /refreshInterval: 900000/);
});
