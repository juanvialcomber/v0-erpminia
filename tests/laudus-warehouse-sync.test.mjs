import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/warehouse-sync.ts','utf8');
const route = fs.readFileSync('app/api/cron/laudus-warehouses-weekly/route.ts','utf8');
const policy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029214500_laudus_warehouse_sync_domain.sql','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('warehouse sync uses the verified current Laudus warehouse list endpoint',()=>{
  assert.match(sync,/\/production\/warehouses\/list/);
  assert.match(sync,/warehouseId/);
  assert.match(sync,/motil_ingest_laudus_warehouses/);
});

test('warehouse sync is bounded read-only and usage tracked',()=>{
  assert.match(sync,/limit: 100/);
  assert.match(sync,/canonicalWarehousesMutated: false/);
  assert.match(sync,/laudusMutated: false/);
  assert.match(route,/withLaudusApiUsageTracking/);
  assert.doesNotMatch(sync,/\.insert\(|\.update\(|\.delete\(/);
});

test('warehouse sync has its own weekly control-plane domain',()=>{
  assert.match(policy,/warehouses/);
  assert.match(migration,/p_domain not in \('products','stock','financial_masters','suppliers','procurement','warehouses'\)/);
  assert.match(migration,/when p_domain in \('suppliers','warehouses'\) then v_now \+ interval '7 days'/);
  assert.match(migration,/weekly_full/);
});

test('warehouse cron is staggered after supplier cron',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-warehouses-weekly'), '50 6 * * 0');
});
