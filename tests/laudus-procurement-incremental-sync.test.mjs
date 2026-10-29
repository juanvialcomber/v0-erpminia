import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/procurement-sync.ts','utf8');
const policy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029212000_laudus_procurement_sync_domains.sql','utf8');
const budgetMigration = fs.readFileSync('supabase/migrations/20261029224000_laudus_budget_headroom_v3.sql','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const procurementRoute = fs.readFileSync('app/api/cron/laudus-procurement-daily/route.ts','utf8');
const supplierRoute = fs.readFileSync('app/api/cron/laudus-suppliers-weekly/route.ts','utf8');

test('procurement sync uses current Laudus list endpoints',()=>{
  assert.match(sync,/\/purchases\/suppliers\/list/);
  assert.match(sync,/\/purchases\/orders\/list/);
  assert.match(sync,/\/purchases\/invoices\/list/);
  assert.match(sync,/\/purchases\/payments\/list/);
});

test('transaction sync is bounded and supplier scan is weekly-bounded',()=>{
  assert.match(sync,/listRecent\('\/purchases\/orders\/list', 'issuedDate', 2\)/);
  assert.match(sync,/listRecent\('\/purchases\/invoices\/list', 'issuedDate', 2\)/);
  assert.match(sync,/listRecent\('\/purchases\/payments\/list', 'issuedDate', 2\)/);
  assert.match(sync,/for \(let page = 0; page < 25; page \+= 1\)/);
  assert.match(sync,/limit: 100/);
});

test('Laudus procurement remains staging-only and derives accounts payable locally',()=>{
  assert.match(sync,/motil_ingest_laudus_suppliers/);
  assert.match(sync,/motil_ingest_laudus_procurement_documents/);
  assert.match(sync,/motil_ingest_laudus_purchase_payments/);
  assert.match(sync,/motil_refresh_laudus_financial_staging/);
  assert.match(sync,/accountsPayableDerived: true/);
  assert.doesNotMatch(sync,/\.from\('canonical_/);
  assert.doesNotMatch(sync,/insert\(|update\(|delete\(/);
});

test('sync control knows supplier and procurement domains',()=>{
  assert.match(policy,/suppliers/);
  assert.match(policy,/procurement/);
  assert.match(migration,/p_domain not in \('products','stock','financial_masters','suppliers','procurement'\)/);
  assert.match(migration,/weekly_full/);
  assert.match(migration,/latest_200_per_entity/);
});

test('crons are staggered to avoid Laudus overlap',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-procurement-daily'), '40 5 * * *');
  assert.equal(byPath.get('/api/cron/laudus-suppliers-weekly'), '20 6 * * 0');
});

test('changed rows are not overstated when RPCs only report staged rows',()=>{
  const changedClaims = [...sync.matchAll(/changed:\s*(\w+)/g)].map((match) => match[1]);
  assert.ok(changedClaims.length >= 2);
  assert.ok(changedClaims.every((value) => value === '0'));
});


test('new Laudus cron entrypoints participate in exact API usage tracking',()=>{
  assert.match(procurementRoute,/withLaudusApiUsageTracking/);
  assert.match(supplierRoute,/withLaudusApiUsageTracking/);
});

test('procurement extension preserves the current budget-aware product cadence',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-products-daily'), '0 3 * * *');
  assert.match(budgetMigration,/when p_domain='products' then v_now \+ interval '24 hours'/);
});
