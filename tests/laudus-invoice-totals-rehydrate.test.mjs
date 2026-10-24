import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const reader = fs.readFileSync('lib/integrations/laudus/purchase-invoice-totals.ts', 'utf8');
const client = fs.readFileSync('lib/integrations/laudus/client.ts', 'utf8');
const route = fs.readFileSync('app/api/integrations/laudus/purchase-invoices/rehydrate/route.ts', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20261024040000_laudus_invoice_totals_rehydrate.sql', 'utf8');

test('invoice totals rehydrate uses one documented Laudus list call', () => {
  assert.match(reader, /\/purchases\/invoices\/list/);
  assert.match(reader, /limit: 0/);
  for (const field of ['purchaseInvoiceId', 'totals.net', 'totals.VAT', 'totals.total', 'totals.currencyCode']) {
    assert.match(reader, new RegExp(field.replace('.', '\\.')));
  }
  assert.match(client, /query\.options\?\.limit === 0/);
});

test('invoice totals rehydrate is admin scoped and staging only', () => {
  assert.match(route, /if \(!access\.admin\)/);
  assert.match(route, /canonicalMutated: false/);
  assert.match(route, /laudusMutated: false/);
  assert.match(migration, /integration\.laudus_purchase_invoices/);
  assert.doesNotMatch(migration, /public\.procurement_supplier_invoices/);
  assert.doesNotMatch(migration, /public\.procurement_accounts_payable/);
});

test('rehydrate preserves source evidence and monetary fields', () => {
  for (const field of ['net_amount', 'tax_amount', 'total_amount', 'currency']) {
    assert.match(migration, new RegExp(field));
  }
  assert.match(migration, /\{ledger\}/);
});
