import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync('lib/integrations/laudus/purchase-ledger.ts', 'utf8');
const route = fs.readFileSync('app/api/integrations/laudus/purchase-invoices/rehydrate/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261024040000_laudus_invoice_totals_rehydrate.sql', 'utf8');

test('invoice totals rehydrate uses monthly ledger instead of paginating all invoices', () => {
  assert.match(reader, /\/purchases\/invoices\/ledger/);
  assert.match(reader, /year/);
  assert.match(reader, /month/);
  assert.doesNotMatch(reader, /\/purchases\/invoices\/list/);
});

test('invoice totals rehydrate is admin scoped and staging only', () => {
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /laudusMutated: false/);
  assert.match(migration, /integration\.laudus_purchase_invoices/);
  assert.doesNotMatch(migration, /public\.procurement_supplier_invoices/);
  assert.doesNotMatch(migration, /public\.procurement_accounts_payable/);
});

test('rehydrate preserves ledger evidence and monetary fields', () => {
  for (const field of ['net_amount', 'tax_amount', 'total_amount', 'currency']) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /\{ledger\}/);
});
