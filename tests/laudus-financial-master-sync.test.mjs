import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(
  new URL('../lib/integrations/laudus/financial-master-sync.ts', import.meta.url),
  'utf8',
);
const client = readFileSync(
  new URL('../lib/integrations/laudus/client.ts', import.meta.url),
  'utf8',
);

test('financial master sync uses bounded 100-row pages and existing ingest RPCs', () => {
  assert.match(client, /Math\.min\(Math\.max\(query\.options\?\.limit \?\? 5, 1\), 100\)/);
  assert.match(helper, /LAUDUS_SYNC_POLICIES/);
  assert.match(helper, /maxPagesPerRun/);
  assert.match(helper, /page \* policy\.pageSize/);
  assert.match(helper, /motil_ingest_laudus_financial_masters/);
  assert.match(helper, /motil_reconcile_laudus_financial_masters/);
});

test('financial master sync requests only fields observed in successful Laudus payloads', () => {
  assert.match(helper, /'costCenterId','code','name','fullPath','parentId','discontinued'/);
  assert.match(helper, /'depreciateFromMonthOfAcquisition','taxDeductionPercentage'/);
  assert.doesNotMatch(helper, /'modifiedAt'/);
  assert.doesNotMatch(helper, /'acquisitionCost'/);
  assert.doesNotMatch(helper, /'supplierId'/);
});

test('financial master sync remains read only toward Laudus and canonical', () => {
  assert.match(helper, /laudusMutated: false/);
  assert.match(helper, /canonicalMutated: false/);
  assert.doesNotMatch(helper, /fetch\([^)]*api\.laudus\.cl/);
  assert.doesNotMatch(helper, /method:\s*['"](?:PUT|PATCH|DELETE)['"]/);
});


test('financial master sync updates control-plane health', () => {
  assert.match(helper, /markLaudusSyncRunning/);
  assert.match(helper, /markLaudusSyncSuccess/);
  assert.match(helper, /markLaudusSyncFailure/);
  assert.match(helper, /apiListCalls/);
});
