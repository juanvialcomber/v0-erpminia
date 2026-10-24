import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync(
  'supabase/migrations/20261024143000_laudus_payment_status_semantics.sql',
  'utf8',
);

test('negative Laudus purchase documents are not counted as payables', () => {
  assert.match(migration, /when i\.total_amount < 0 then 'credit_adjustment'/);
  assert.match(migration, /when i\.total_amount <= 0 then 0::numeric/);
});

test('positive Laudus purchase documents keep paid partial and unpaid states', () => {
  assert.match(migration, /then 'unpaid'/);
  assert.match(migration, /then 'paid'/);
  assert.match(migration, /else 'partially_paid'/);
});

test('payment status view remains read only evidence', () => {
  assert.match(migration, /integration\.laudus_purchase_invoice_payment_status_v1/);
  assert.doesNotMatch(migration, /insert into public\.procurement_/i);
  assert.doesNotMatch(migration, /update public\.procurement_/i);
});
