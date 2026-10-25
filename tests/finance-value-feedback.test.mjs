import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const finance = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/finance-review-feedback/route.ts','utf8');
const valueApi = fs.readFileSync('app/api/value/scorecard/route.ts','utf8');
const valuePage = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');

test('Daniel can record finance review feedback without mutating Laudus or canonical finance',()=>{
  assert.match(finance,/Revisado/);
  assert.match(finance,/Después/);
  assert.match(finance,/No aplica/);
  assert.match(route,/motil_record_laudus_finance_review_feedback/);
  assert.match(route,/canonicalMutationExecuted: false/);
  assert.match(route,/laudusMutationExecuted: false/);
  assert.match(route,/MODULE_KEYS\.FIN_FINANZAS, true/);
});

test('rejected finance review requires a human reason',()=>{
  assert.match(route,/decision === 'rejected' && !reason/);
  assert.match(finance,/¿Por qué esta prioridad no aplica\?/);
});

test('value scorecard surfaces real finance review adoption separately from ROI',()=>{
  assert.match(valueApi,/laudus_finance_review_feedback_service_v1/);
  assert.match(valueApi,/financeReview/);
  assert.match(valuePage,/Revisiones financieras/);
  assert.match(valuePage,/actor y timestamp/);
});
