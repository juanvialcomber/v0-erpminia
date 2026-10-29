import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const migration = fs.readFileSync('supabase/migrations/20261029204500_laudus_product_budget_headroom.sql','utf8');

test('product sync runs every 12 hours while stock remains every 6 hours',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-products-daily'), '0 */12 * * *');
  assert.equal(byPath.get('/api/cron/laudus-stock-daily'), '10 */6 * * *');
});

test('product freshness SLA and next due align with the reduced call budget',()=>{
  assert.match(migration, /freshness_sla_minutes=840/);
  assert.match(migration, /when p_domain='products' then v_now \+ interval '12 hours'/);
  assert.match(migration, /when p_domain='financial_masters' then v_now \+ interval '24 hours'/);
});
