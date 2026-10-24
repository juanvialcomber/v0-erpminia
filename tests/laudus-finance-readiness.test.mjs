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
  assert.match(helper, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(helper, /laudus_purchase_payments_service_v1/);
  assert.match(helper, /count: 'exact', head: true/);
  assert.match(helper, /\.gt\('total_amount', 0\)/);
  assert.match(helper, /\.lt\('total_amount', 0\)/);
  assert.match(helper, /openDocuments: partiallyPaidDocuments \+ unpaidDocuments/);
});

test('finance readiness exposes accounting, bank and DTE evidence only as aggregate counts', () => {
  assert.match(helper, /laudus_accounting_entries_service_v1/);
  assert.match(helper, /laudus_bank_statements_service_v1/);
  assert.match(helper, /laudus_dtes_service_v1/);
  assert.match(helper, /accountingEntries/);
  assert.match(helper, /bankStatements/);
  assert.match(helper, /pendingDtes/);
  assert.match(card, /Comprobantes contables/);
  assert.match(card, /Cartolas bancarias/);
  assert.match(card, /DTE pendientes/);
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
  assert.match(card, /Centro de control financiero/);
  assert.match(card, /Cobertura operativa/);
  assert.match(card, /Obligaciones con saldo/);
  assert.match(card, /MOTIL propone · humano aprueba/);
  assert.match(card, /ajustes\/créditos separados del saldo por pagar/);
  assert.match(card, /refreshInterval: 900000/);
});

test('finance readiness uses service facades instead of private schemas', () => {
  assert.match(helper, /laudus_purchase_invoice_payment_status_service_v1/);
  assert.match(helper, /laudus_purchase_invoices_service_v1/);
  assert.match(helper, /laudus_purchase_payments_service_v1/);
  assert.match(helper, /laudus_source_status_service_v1/);
  assert.match(helper, /laudus_accounting_entries_service_v1/);
  assert.match(helper, /laudus_bank_statements_service_v1/);
  assert.match(helper, /laudus_dtes_service_v1/);
  assert.doesNotMatch(helper, /\.schema\(['"]integration['"]\)/);
});
