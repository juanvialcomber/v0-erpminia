import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024004500_supply_risk_decision_inbox.sql','utf8');
const route=fs.readFileSync('app/api/procurement/supply-risk/route.ts','utf8');
const card=fs.readFileSync('components/integrations/supply-risk-card.tsx','utf8');

test('supply risk decisions preserve human authority',()=>{
  assert.match(sql,/reviewed','action_required','not_applicable/);
  assert.match(sql,/grant select,insert .*service_role/);
  assert.match(route,/purchaseCreated: false/);
  assert.match(route,/canonicalModified: false/);
  assert.match(route,/sourceModified: false/);
  assert.match(card,/Revisar/);
  assert.match(card,/Actuar/);
  assert.match(card,/No aplica/);
});

test('action required is structured and not an automatic purchase',()=>{
  assert.match(route,/request_quote/);
  assert.match(route,/diversify_supplier/);
  assert.match(route,/validate_price/);
  assert.match(route,/replenish_stock/);
  assert.doesNotMatch(route,/insert\([\s\S]{0,300}purchase_orders/);
});
