import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const vercel = fs.readFileSync('vercel.json','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029204500_laudus_product_budget_headroom.sql','utf8');

test('product sync runs every 12 hours while stock remains every 6 hours',()=>{
  assert.match(vercel, /laudus-products-daily"[\s\S]*?"schedule": "0 \*\/12 \* \* \*"/);
  assert.match(vercel, /laudus-stock-daily"[\s\S]*?"schedule": "10 \*\/6 \* \* \*"/);
});

test('product freshness SLA and next due align with the reduced call budget',()=>{
  assert.match(migration, /freshness_sla_minutes=840/);
  assert.match(migration, /when p_domain='products' then v_now \+ interval '12 hours'/);
  assert.match(migration, /when p_domain='financial_masters' then v_now \+ interval '24 hours'/);
});
