import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(new URL('../supabase/migrations/20261102213000_laudus_sales_raw_staging.sql', import.meta.url), 'utf8');
const sync = readFileSync(new URL('../lib/integrations/laudus/sales-sync.ts', import.meta.url), 'utf8');
const api = readFileSync(new URL('../app/api/integrations/laudus/sales-sync/route.ts', import.meta.url), 'utf8');
const cron = readFileSync(new URL('../app/api/cron/laudus-sales-daily/route.ts', import.meta.url), 'utf8');
const coverage = readFileSync(new URL('../app/api/integrations/laudus/coverage/route.ts', import.meta.url), 'utf8');
const vercel = readFileSync(new URL('../vercel.json', import.meta.url), 'utf8');

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

test('commercial sync remains admin controlled and the dormant cron stays usage-tracked but unscheduled', () => {
  assert.match(api, /resolveDataHealthAccess/);
  assert.match(api, /access\.admin/);
  assert.match(api, /withLaudusApiUsageTracking/);
  assert.match(cron, /CRON_SECRET/);
  assert.match(cron, /withLaudusApiUsageTracking/);
  assert.doesNotMatch(vercel, /\/api\/cron\/laudus-sales-daily/);
});

test('coverage keeps private sales staging unavailable until a public service view exists', () => {
  assert.match(coverage, /sales_customer/);
  assert.match(coverage, /sales_invoice/);
  assert.match(coverage, /sales_receipt/);
  assert.match(coverage, /records: null/);
  assert.match(coverage, /status: 'unavailable'/);
  assert.doesNotMatch(coverage, /\.from\('raw_records'\)/);
  assert.doesNotMatch(coverage, /schema\('integration'\)/);
});
