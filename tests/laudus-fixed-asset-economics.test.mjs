import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/fixed-asset-economics.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/fixed-asset-economics/route.ts', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');

test('fixed-asset economics is bounded and read only', () => {
  assert.match(helper, /candidates\.slice\(0, 6\)/);
  assert.match(helper, /getLaudusReadOnly/);
  assert.match(helper, /persisted: false/);
  assert.match(helper, /mode: 'read_only'/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('fixed-asset economics exposes evidence needed for depreciation without claiming book value', () => {
  assert.match(helper, /acquisitionCost/);
  assert.match(helper, /realizableValue/);
  assert.match(helper, /depreciationType/);
  assert.match(helper, /depreciateFromMonthOfAcquisition/);
  assert.match(helper, /depreciateWithInflationCorrection/);
  assert.match(helper, /depreciationShape/);
  assert.match(helper, /itemFields/);
  assert.match(helper, /depreciationSummary/);
  assert.match(helper, /amountTotal/);
  assert.match(helper, /accumulatedMax/);
  assert.match(helper, /accumulatedWithInflationCorrectionMax/);
  assert.match(helper, /purchaseInvoiceShape/);
  assert.match(helper, /objectShape/);
  assert.doesNotMatch(helper, /bookValue/);
});

test('route selects only strong review candidates and stays tenant scoped', () => {
  assert.match(route, /motil_laudus_fixed_asset_review_queue/);
  assert.match(route, /strong_identifier_candidate/);
  assert.match(route, /strong_candidate/);
  assert.match(route, /context\.organizationId/);
  assert.match(proxy, /\/api\/integrations\/laudus\/fixed-asset-economics/);
});
