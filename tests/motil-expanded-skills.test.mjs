import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const catalog = readFileSync(new URL('../lib/motil-ai/skills/catalog.ts', import.meta.url), 'utf8');
const availability = readFileSync(new URL('../lib/motil-ai/skills/availability.ts', import.meta.url), 'utf8');

test('expanded skill catalog includes operational exception and planning capabilities', () => {
  for (const key of [
    'inventory-discrepancy-review',
    'supplier-return-resolution',
    'maintenance-procurement-urgency',
    'stock-transfer-opportunity',
    'asset-replacement-economics',
    'cash-impact-maintenance',
    'unit-normalization-review',
    'purchase-request-completeness',
  ]) {
    assert.match(catalog, new RegExp(key));
  }
});

test('skills activate from evidence and synced domains instead of being advertised unconditionally', () => {
  assert.match(availability, /state: 'available' \| 'degraded' \| 'dormant'/);
  assert.match(availability, /userVisible: availabilityState !== 'dormant'/);
  assert.match(availability, /evaluateSkillReadiness/);
});

test('all capabilities remain evidence or human-review bounded', () => {
  assert.doesNotMatch(catalog, /autonomous_write|auto.?approve|auto.?pay|auto.?purchase/i);
});
