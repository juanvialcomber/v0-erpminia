import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const model = readFileSync(new URL('../lib/integrations/laudus/model.ts', import.meta.url), 'utf8');
const reconcile = readFileSync(new URL('../lib/integrations/laudus/reconcile.ts', import.meta.url), 'utf8');

test('five migration masters have deterministic reconciliation keys', () => {
  for (const type of ['product', 'supplier', 'warehouse', 'cost_center', 'fixed_asset']) {
    assert.match(model, new RegExp("case '" + type + "'"));
  }
});

test('fixed assets reconcile to canonical MOTIL assets without auto-apply', () => {
  assert.match(model, /fixed_asset: \{ schema: 'canonical', table: 'assets', authority: 'candidate_only', autoApply: false \}/);
});

test('deterministic matcher uses normalized exact keys only', () => {
  assert.match(reconcile, /normalizeCode/);
  assert.match(reconcile, /normalizeRut/);
  assert.match(reconcile, /status: 'matched'/);
  assert.match(reconcile, /status: 'conflict'/);
  assert.match(reconcile, /status: 'new_candidate'/);
  assert.doesNotMatch(reconcile, /levenshtein|fuzzy|similarity|distance|embedding/i);
});

test('supplier matches use tax id and all other supported masters use exact code', () => {
  assert.match(reconcile, /record\.entityType === 'supplier'/);
  assert.match(reconcile, /exact_tax_id/);
  assert.match(reconcile, /exact_code/);
});
