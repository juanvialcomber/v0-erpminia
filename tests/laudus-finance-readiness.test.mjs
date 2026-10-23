import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/finance-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/finance-readiness/route.ts', import.meta.url), 'utf8');
const card = readFileSync(new URL('../components/integrations/laudus-finance-readiness-card.tsx', import.meta.url), 'utf8');

test('finance readiness measures payable and payment completeness', () => {
  assert.match(helper, /invoiceCoverage/);
  assert.match(helper, /dueDateCoverage/);
  assert.match(helper, /payableCoverage/);
  assert.match(helper, /reconciliationCoverage/);
});

test('finance readiness keeps human authority and blocks automatic payment actions', () => {
  assert.match(helper, /autoCreatePayment: false/);
  assert.match(helper, /autoReconcilePayment: false/);
  assert.match(helper, /humanApprovalRequired: true/);
  assert.match(helper, /motilPaymentApprovalRole: 'human_authority'/);
});

test('finance readiness API is scoped to finance permissions', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('finance readiness UI explains Laudus as financial evidence without payment authority', () => {
  assert.match(card, /Preparación financiera para Laudus/);
  assert.match(card, /no puede aprobar, crear ni conciliar pagos automáticamente/);
  assert.match(card, /Aprobación humana obligatoria/);
});
