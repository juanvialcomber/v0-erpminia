import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync('lib/integrations/laudus/purchase-payments.ts', 'utf8');
const route = fs.readFileSync('app/api/integrations/laudus/purchase-payments/sync/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261024035000_laudus_purchase_payments_staging.sql', 'utf8');

test('Laudus purchase payment reader requests invoice allocations explicitly', () => {
  for (const field of ['paymentId', 'issuedDate', 'dueDate', 'document', 'deposited', 'purchaseInvoices']) {
    assert.match(reader, new RegExp(`['"]${field}['"]`));
  }
  assert.match(reader, /\/purchases\/payments\/list/);
  assert.match(reader, /pageSize = 25/);
});

test('purchase payment sync remains admin scoped and read only', () => {
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /mode: 'read_only'/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /laudusMutated: false/);
});

test('Laudus payments stage separately from MOTIL operational payables', () => {
  assert.match(migration, /integration\.laudus_purchase_payments/);
  assert.match(migration, /integration\.laudus_purchase_payment_allocations/);
  assert.match(migration, /integration\.laudus_purchase_invoice_payment_status_v1/);
  assert.doesNotMatch(migration, /insert into public\.procurement_supplier_payments/i);
  assert.doesNotMatch(migration, /update public\.procurement_accounts_payable/i);
  assert.match(migration, /canonical_mutated', false/);
  assert.match(migration, /laudus_mutated', false/);
});
