import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync(new URL('../lib/motil-ai/skills/catalog.ts', import.meta.url), 'utf8');
const router = readFileSync(new URL('../lib/motil-ai/skills/router.ts', import.meta.url), 'utf8');
const gates = readFileSync(new URL('../lib/motil-ai/skills/readiness.ts', import.meta.url), 'utf8');

test('MOTIL skill catalog covers operational and Laudus-enabled intelligence without exposing autonomous writes', () => {
  for (const key of [
    'laudus-source-reconciliation',
    'inventory-stock-risk',
    'procurement-three-way-match',
    'supplier-performance',
    'maintenance-cost-trace',
    'asset-financial-360',
    'cost-center-control',
    'accounts-payable-exposure',
    'purchase-price-variance',
    'data-quality-guardian',
    'purchase-need-context',
    'dte-procurement-check',
  ]) {
    assert.match(catalog, new RegExp(key));
  }
  assert.doesNotMatch(catalog, /risk: 'autonomous_write'/);
});

test('router is deterministic and caps simultaneous skills', () => {
  assert.match(router, /routeMotilSkills/);
  assert.match(router, /slice\(0, Math\.max\(1, maxSkills\)\)/);
  assert.doesNotMatch(router, /Math\.random/);
});

test('skill readiness fails closed when evidence or synced data is missing', () => {
  assert.match(gates, /missingEvidence/);
  assert.match(gates, /missingSyncedData/);
  assert.match(gates, /canAct: false/);
});

test('unknown intent falls back to data quality instead of hallucinating a domain capability', () => {
  assert.match(router, /data-quality-guardian/);
});
