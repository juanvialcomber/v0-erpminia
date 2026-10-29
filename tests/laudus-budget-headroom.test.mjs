import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const migration = fs.readFileSync('supabase/migrations/20261029224000_laudus_budget_headroom_v3.sql','utf8');

test('product sync runs daily while stock remains every 6 hours',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-products-daily'), '0 3 * * *');
  assert.equal(byPath.get('/api/cron/laudus-stock-daily'), '10 */6 * * *');
});

test('financial masters run every 48 hours to preserve API headroom',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-financial-masters-daily'), '20 4 */2 * *');
});

test('freshness SLA and next due align with the current reduced call budget',()=>{
  assert.match(migration, /freshness_sla_minutes=1560/);
  assert.match(migration, /freshness_sla_minutes=3000/);
  assert.match(migration, /when p_domain='products' then v_now \+ interval '24 hours'/);
  assert.match(migration, /when p_domain='financial_masters' then v_now \+ interval '48 hours'/);
});
