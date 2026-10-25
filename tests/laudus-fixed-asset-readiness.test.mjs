import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const helper = readFileSync(new URL('../lib/integrations/laudus/fixed-asset-readiness.ts', import.meta.url), 'utf8');
const route = readFileSync(new URL('../app/api/integrations/laudus/fixed-asset-readiness/route.ts', import.meta.url), 'utf8');
const proxy = readFileSync(new URL('../proxy.ts', import.meta.url), 'utf8');

test('fixed-asset probe is bounded and read only', () => {
  assert.match(helper, /CANDIDATE_PATHS/);
  assert.match(helper, /limit: 2/);
  assert.match(helper, /persisted: false/);
  assert.match(helper, /mode: 'read_only'/);
  assert.doesNotMatch(helper, /\.insert\(|\.update\(|\.upsert\(|\.delete\(/);
});

test('fixed-asset probe returns only availability and field metadata', () => {
  assert.match(helper, /sampleFields/);
  assert.match(helper, /costFields/);
  assert.match(helper, /attempts: attempts\.map/);
  assert.doesNotMatch(helper, /payload:/);
});

test('fixed-asset readiness is finance scoped and available to finance manager', () => {
  assert.match(route, /FIN_FINANZAS/);
  assert.match(proxy, /\/api\/integrations\/laudus\/fixed-asset-readiness/);
});
