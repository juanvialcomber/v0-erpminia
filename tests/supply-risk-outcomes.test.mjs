import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024011000_supply_risk_outcomes.sql','utf8');
const route=fs.readFileSync('app/api/procurement/supply-risk/route.ts','utf8');
const card=fs.readFileSync('components/integrations/supply-risk-card.tsx','utf8');

test('supply risk outcomes are append-only human observations',()=>{
  assert.match(sql,/resolved','risk_reduced','no_change','false_positive/);
  assert.match(sql,/unique \(organization_id, decision_id\)/);
  assert.match(sql,/grant select,insert .*service_role/);
  assert.match(route,/outcomeDecisionId/);
  assert.match(route,/risk_score_before/);
  assert.match(route,/risk_score_after/);
  assert.match(route,/purchaseCreated: false/);
});

test('outcome UI closes the loop without claiming causality',()=>{
  assert.match(card,/Registrar resultado/);
  assert.match(card,/Resuelto/);
  assert.match(card,/Riesgo reducido/);
  assert.match(card,/Falso positivo/);
});
