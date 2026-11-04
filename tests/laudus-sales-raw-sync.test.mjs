import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261102213000_laudus_sales_raw_staging.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/integrations/laudus/sales-sync.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/integrations/laudus/sales-sync/route.ts', import.meta.url), 'utf8');

test('sales evidence is versioned in raw staging and never promotes canonical state', () => {
  assert.match(migration, /integration\.raw_records/);
  assert.match(migration, /is_current = false/);
  assert.match(migration, /payload_hash/);
  assert.match(migration, /canonical_mutated', false/);
  assert.match(migration, /laudus_mutated', false/);
  assert.match(migration, /sales_customer/);
  assert.match(migration, /sales_invoice/);
  assert.match(migration, /sales_receipt/);
});

test('sales sync is bounded and covers six commercial entities', () => {
  for (const path of [
    '/sales/customers/list',
    '/sales/salesmen/list',
    '/sales/orders/list',
    '/sales/invoices/list',
    '/sales/waybills/list',
    '/sales/receipts/list',
  ]) assert.match(sync, new RegExp(path.replaceAll('/', '\\/')));

  assert.match(sync, /limit: 100/);
  assert.match(sync, /pages: 2/);
  assert.match(sync, /pages: 1/);
  assert.match(sync, /stagingOnly: true/);
  assert.match(sync, /canonicalMutated: false/);
  assert.match(sync, /laudusMutated: false/);
});

test('commercial sync remains admin controlled and usage-tracked without automatic scheduling', () => {
  assert.match(api, /resolveDataHealthAccess/);
  assert.match(api, /access\.admin/);
  assert.match(api, /withLaudusApiUsageTracking/);
});


test('sales receipts select receipt type leaf fields and keep modifiedAt ordering', () => {
  assert.match(sync, /'receiptType\.code'/);
  assert.match(sync, /'receiptType\.description'/);
  assert.doesNotMatch(sync, /'receiptId','receiptType','issuedDate'/);
  assert.doesNotMatch(sync, /salesInvoices\.itemId/);
  assert.match(sync, /sales_receipt:[\s\S]*?orderField:\s*'modifiedAt'/);
});
