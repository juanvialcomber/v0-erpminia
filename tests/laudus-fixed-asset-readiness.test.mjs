import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/fixed-asset-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/fixed-asset-readiness/route.ts', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');

test('fixed-asset probe is bounded and read only', () => {
  assert.match(helper, /FIXED_ASSET_LIST_PATH/);
  assert.match(helper, /limit: 1/);
  assert.match(helper, /calls: detailStatus === null \? 1 : 2/);
  assert.match(helper, /persisted: false/);
  assert.match(helper, /mode: 'read_only'/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('fixed-asset probe requests known fields before inspecting one detail', () => {
  assert.match(helper, /KNOWN_LIST_FIELDS/);
  assert.match(helper, /fixedAssetId/);
  assert.match(helper, /dateAcquisition/);
  assert.match(helper, /realizableValue/);
  assert.match(helper, /getLaudusReadOnly/);
  assert.match(helper, /detailFields/);
  assert.match(helper, /detailCostFields/);
  assert.match(helper, /exposesAcquisitionCostField/);
  assert.doesNotMatch(helper, /acquisitionCost:/);
});

test('fixed-asset readiness is finance scoped and available to finance manager', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(proxy, /\/api\/integrations\/laudus\/fixed-asset-readiness/);
});
