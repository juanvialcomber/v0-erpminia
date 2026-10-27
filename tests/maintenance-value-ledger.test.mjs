import assert from 'node:assert/strict';
import test from 'node:test';
import { readFile } from 'node:fs/promises';

const api = await readFile(new URL('../app/api/maintenance/value-ledger/route.ts', import.meta.url), 'utf8');
const ui = await readFile(new URL('../components/maintenance/maintenance-value-ledger.tsx', import.meta.url), 'utf8');
const home = await readFile(new URL('../components/dashboard/maintenance-home.tsx', import.meta.url), 'utf8');

test('maintenance value ledger derives from canonical work orders and stays read only', () => {
  assert.match(api, /from\('maintenance_work_orders'\)/);
  assert.match(api, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(api, /\.not\('created_by', 'is', null\)/);
  assert.doesNotMatch(api, /\.insert\(/);
  assert.doesNotMatch(api, /\.update\(/);
  assert.doesNotMatch(api, /\.delete\(/);
});

test('value ledger refuses to fabricate ROI before a comparable baseline exists', () => {
  assert.match(api, /baselineStatus: 'missing'/);
  assert.match(api, /attribution: 'NO_MEDIBLE_AUN'/);
  assert.match(api, /pricingReadiness: 'MARKET_ANCHORED'/);
  assert.match(api, /Minutos administrativos por OT antes de MOTIL versus con MOTIL/);
  assert.match(ui, /No se calcula ROI sin baseline comparable/);
});

test('coverage metrics preserve numerator and denominator', () => {
  for (const metric of ['assignmentCoverage', 'assetCoverage', 'timerCoverage', 'rootCauseCoverage', 'preventiveActionCoverage', 'meterCoverage']) {
    assert.match(api, new RegExp(metric));
  }
  assert.match(api, /numerator:/);
  assert.match(api, /denominator:/);
});

test('leadership maintenance home exposes the ledger under progressive disclosure', () => {
  assert.match(home, /MaintenanceValueLedger/);
  assert.match(home, /mode === 'leadership'/);
});
