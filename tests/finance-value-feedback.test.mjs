import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const finance = fs.readFileSync('app/dashboard/finanzas/trazabilidad/page.tsx','utf8');
const route = fs.readFileSync('app/api/integrations/laudus/finance-review-feedback/route.ts','utf8');
const valueApi = fs.readFileSync('app/api/value/scorecard/route.ts','utf8');
const valuePage = fs.readFileSync('app/dashboard/valor/page.tsx','utf8');

test('Daniel can record finance review feedback without mutating Laudus or canonical finance',()=>{
  assert.match(finance,/Revisado/);
  assert.match(finance,/Posponer/);
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
  assert.match(valueApi,/latestFinanceReviews/);
  assert.match(valueApi,/financeReviewRows\.length >= 20/);
  assert.match(valuePage,/Revisiones financieras/);
  assert.match(valuePage,/actor y timestamp/);
});


test('finance traceability does not inflate adoption with repeated review clicks',()=>{
  assert.match(route,/latestByInvoice/);
  assert.match(finance,/latestReviewByInvoice/);
  assert.match(finance,/priorReview\?\.decision === 'accepted'/);
});


test('finance traceability review timing is bounded, audited and not presented as ROI',()=>{
  assert.match(route,/decisionLatencyMs/);
  assert.match(route,/30 \* 60 \* 1000/);
  assert.match(route,/finance_review_decision/);
  assert.match(route,/decision_latency_ms/);
  assert.match(route,/not manual baseline/);
  assert.match(finance,/reviewSessionStartedAt/);
  assert.match(valueApi,/financeReviewTiming/);
  assert.match(valuePage,/Latencia observada/);
  assert.match(valuePage,/No es aún baseline manual/);
});


test('manual finance baseline is explicit, bounded and separate from assisted timing',()=>{
  const baselineRoute = fs.readFileSync('app/api/value/finance-baseline/route.ts','utf8');
  assert.match(baselineRoute,/finance_review_manual_baseline/);
  assert.match(baselineRoute,/manual Laudus review timed outside MOTIL assistance/);
  assert.match(baselineRoute,/caseCount > 20/);
  assert.match(valuePage,/Baseline manual/);
  assert.match(valuePage,/Iniciar baseline/);
  assert.match(valuePage,/Finalizar medición/);
  assert.match(valuePage,/por sí sola no demuestra ahorro/);
});


test('time reduction stays gated until manual and assisted samples are sufficient',()=>{
  assert.match(valuePage,/baselineSampleCount >= 3/);
  assert.match(valuePage,/assistedTimingSample >= 20/);
  assert.match(valuePage,/Reducción observada de tiempo/);
  assert.match(valuePage,/Se habilita sólo con 3 muestras manuales y 20 decisiones asistidas con tiempo válido/);
});
