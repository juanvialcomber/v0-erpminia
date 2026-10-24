import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const route = readFileSync(
  new URL('../app/api/integrations/laudus/finance-review/feedback/route.ts', import.meta.url),
  'utf8',
);

test('finance review feedback requires finance write access', () => {
  assert.match(route, /FIN_FINANZAS, true/);
  assert.match(route, /getOrganizationContext/);
});

test('finance review feedback validates invoice and supplier scope', () => {
  assert.match(route, /laudus_purchase_invoice_payment_status_v1/);
  assert.match(route, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(route, /\.from\('suppliers'\)/);
  assert.match(route, /Proveedor sugerido fuera de alcance/);
});

test('rejected feedback requires a reason', () => {
  assert.match(route, /decision === 'rejected' && !reason/);
  assert.match(route, /Indica por qué no coincide/);
});

test('feedback endpoint never writes canonical payables or payments', () => {
  assert.match(route, /laudus_finance_review_feedback/);
  assert.doesNotMatch(route, /procurement_accounts_payable/);
  assert.doesNotMatch(route, /procurement_supplier_payments/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /paymentMutated: false/);
});
