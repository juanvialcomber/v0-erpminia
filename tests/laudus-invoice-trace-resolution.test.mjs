import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261024075500_laudus_invoice_trace_resolution.sql', 'utf8');

test('Laudus invoice trace resolver uses exact upstream IDs and preserves uncertainty', () => {
  assert.match(migration, /po\.laudus_purchase_order_id = t\.from_id/);
  assert.match(migration, /wb\.laudus_purchase_waybill_id = t\.from_id/);
  assert.match(migration, /exact_purchase_order/);
  assert.match(migration, /exact_waybill/);
  assert.match(migration, /ambiguous_id/);
  assert.match(migration, /unresolved/);
  assert.match(migration, /from_step/);
});

test('trace coverage remains read only and does not project into canonical procurement', () => {
  assert.match(migration, /canonical_mutated', false/);
  assert.match(migration, /laudus_mutated', false/);
  assert.doesNotMatch(migration, /insert into public\.procurement_/i);
  assert.doesNotMatch(migration, /update public\.procurement_/i);
});
