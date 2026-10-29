import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const routePath = new URL('../app/api/internal/laudus-ledger-probe/route.ts', import.meta.url);

test('Laudus ledger probe is preview-only and read-only', async () => {
  const route = await readFile(routePath, 'utf8');

  assert.match(route, /VERCEL_ENV !== 'preview'/);
  assert.match(route, /runLaudusReadOnlySmokeTest/);
  assert.match(route, /withLaudusApiUsageTracking/);
  assert.match(route, /laudus_api_budget_service_v1/);
  assert.doesNotMatch(route, /\binsert\b/i);
  assert.doesNotMatch(route, /\bupdate\b/i);
  assert.doesNotMatch(route, /\bdelete\b/i);
});
