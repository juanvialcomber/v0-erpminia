import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/accounting-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/accounting-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-accounting-readiness-card.tsx', import.meta.url), 'utf8');

test('accounting readiness keeps commitments distinct from recognized costs', () => {
  assert.match(helper, /purchase_commitment/);
  assert.match(helper, /actual_cost/);
  assert.match(helper, /commitmentsRemainDistinctFromRecognizedCosts: true/);
});

test('accounting readiness measures canonical identity coverage', () => {
  assert.match(helper, /costCenterCoverage/);
  assert.match(helper, /productCoverage/);
  assert.match(helper, /assetCoverage/);
  assert.match(helper, /supplierCoverage/);
  assert.match(helper, /workOrderCoverage/);
});

test('accounting readiness never posts or rewrites ledger automatically', () => {
  assert.match(helper, /autoPostAccountingEntries: false/);
  assert.match(helper, /autoRewriteLedger: false/);
  assert.match(helper, /humanReviewRequired: true/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('accounting readiness is finance permission scoped', () => {
  assert.match(route, /FIN_FINANZAS/);
});

test('UI explains Laudus as reconciliation source, not automatic accounting authority', () => {
  assert.match(card, /Preparación contable para Laudus/);
  assert.match(card, /no para reescribir historia operacional/);
  assert.match(card, /sin contabilización ni reescritura automática/);
});
