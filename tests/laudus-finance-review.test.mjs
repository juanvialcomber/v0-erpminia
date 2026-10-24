import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(
  new URL('../lib/integrations/laudus/finance-review.ts', import.meta.url),
  'utf8',
);
const route = readFileSync(
  new URL('../app/api/integrations/laudus/finance-review/route.ts', import.meta.url),
  'utf8',
);
const card = readFileSync(
  new URL('../components/integrations/laudus-finance-review-card.tsx', import.meta.url),
  'utf8',
);
const page = readFileSync(
  new URL('../app/dashboard/finanzas/page.tsx', import.meta.url),
  'utf8',
);

test('finance review stays read-only and finance scoped', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(route, /getSupabaseServerClient/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
  assert.match(helper, /automaticPromotion: false/);
  assert.match(helper, /humanReviewRequired: true/);
});

test('finance review ranks evidence deterministically', () => {
  assert.match(helper, /exact_unique_normalized_supplier_name/);
  assert.match(helper, /deterministic_v1/);
  assert.match(helper, /priorityScore/);
  assert.match(helper, /overdueDays/);
  assert.match(helper, /outstandingAmount/);
  assert.match(helper, /partially_paid/);
});

test('finance review bounds source reads and returns a short queue', () => {
  assert.match(helper, /batchSize = 500/);
  assert.match(helper, /\.range\(offset, offset \+ batchSize - 1\)/);
  assert.match(helper, /queue\.slice\(0, 10\)/);
});

test('finance review presents conclusion evidence and next action', () => {
  assert.match(card, /Revisión priorizada de obligaciones/);
  assert.match(card, /Proveedor identificado/);
  assert.match(card, /Primero revisar/);
  assert.match(card, /row\.nextAction/);
  assert.match(card, /No crea CxP automáticamente/);
});

test('finance dashboard includes the review surface', () => {
  assert.match(page, /LaudusFinanceReviewCard/);
});


test('finance review feedback controls are capability and permission gated', () => {
  assert.match(helper, /feedbackAvailable/);
  assert.match(helper, /laudus_finance_review_feedback/);
  assert.match(card, /useModuleAccess/);
  assert.match(card, /canEdit\('fin_finanzas'\)/);
  assert.match(card, /Boolean\(data\?\.feedbackAvailable\)/);
  assert.match(card, /Coincide/);
  assert.match(card, /No coincide/);
});


test('finance review quantifies high-priority balance concentration', () => {
  assert.match(helper, /highPriorityAmount/);
  assert.match(helper, /highPriorityAmountShare/);
  assert.match(card, /% del saldo/);
});


test('finance review score evidence is decomposed for explainability', () => {
  assert.match(helper, /breakdown:/);
  assert.match(helper, /age: agePoints/);
  assert.match(helper, /amount: amountPoints/);
  assert.match(helper, /payment: paymentPoints/);
  assert.match(helper, /identity: identityPoints/);
  assert.match(card, /Score: antigüedad/);
});
