import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const source = readFileSync(
  new URL('../lib/integrations/laudus/product-intelligence.ts', import.meta.url),
  'utf8',
);

test('Laudus product intelligence separates operational domains', () => {
  for (const token of ['REPUESTO', 'FILTRO', 'EPP', 'REACTIVO', 'ACTIVOFIJO', 'SERVI']) {
    assert.match(source, new RegExp(token));
  }
});

test('services and fixed assets are excluded from inventory by default', () => {
  assert.match(source, /ACTIVOFIJO:[\s\S]*inventoryEligibility: 'exclude'/);
  assert.match(source, /SERVI:[\s\S]*inventoryEligibility: 'exclude'/);
});

test('maintenance supplies are eligible for warehouse and maintenance', () => {
  assert.match(source, /REPUESTO:[\s\S]*inventoryEligibility: 'eligible'[\s\S]*'warehouse'[\s\S]*'maintenance'/);
  assert.match(source, /FILTRO:[\s\S]*inventoryEligibility: 'eligible'[\s\S]*'warehouse'[\s\S]*'maintenance'/);
});

test('ambiguous categories remain reviewable instead of auto-applied', () => {
  assert.match(source, /inventoryEligibility: 'review'/);
  assert.match(source, /requiere resolución antes de adoptar/);
});

test('classification exposes data quality flags for bad Laudus master rows', () => {
  for (const flag of [
    'missing_sku',
    'missing_description',
    'invalid_or_missing_unit',
    'generic_or_placeholder_description',
  ]) {
    assert.match(source, new RegExp(flag));
  }
});
