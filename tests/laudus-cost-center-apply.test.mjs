import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261027123000_apply_approved_laudus_cost_centers.sql', import.meta.url),
  'utf8',
);

test('Laudus cost-center applicator is gated by human approval and deterministic evidence', () => {
  assert.match(migration, /d\.decision='approve_proposal'/);
  assert.match(migration, /strong_asset_backed_proposal/);
  assert.match(migration, /exact_plate_asset_support/);
  assert.match(migration, /canonical_asset_or_plate_changed/);
  assert.match(migration, /canonical_parent_missing/);
});

test('Laudus cost-center applicator never overwrites canonical codes or writes back to Laudus', () => {
  assert.match(migration, /canonical_code_already_exists/);
  assert.doesNotMatch(migration, /update\s+canonical\.cost_centers/i);
  assert.doesNotMatch(migration, /delete\s+from\s+canonical\.cost_centers/i);
  assert.match(migration, /laudus_mutated',false/);
});

test('Laudus cost-center applicator preserves lineage and stays service-role only', () => {
  assert.match(migration, /staging\.import_batches/);
  assert.match(migration, /source_file_sha256/);
  assert.match(migration, /reconciliation_decision_id/);
  assert.match(migration, /reconciliation_actor_user_id/);
  assert.match(migration, /revoke all on function/);
  assert.match(migration, /grant execute on function[\s\S]*service_role/);
});
