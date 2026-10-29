import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261029160000_laudus_product_stage_terminal_states.sql',
  'utf8',
);

test('Laudus product ingest projects source products into private staging', () => {
  assert.match(migration, /insert into integration\.laudus_products/);
  assert.match(migration, /on conflict \(source_id, external_id\)/);
  assert.match(migration, /REPUESTO/);
  assert.match(migration, /maintenance_supply/);
  assert.match(migration, /inventory_eligibility/);
});

test('product polling preserves terminal ignored review decisions', () => {
  assert.match(migration, /reconciliation_items\.resolution_status = 'ignored'/);
  assert.match(migration, /then 'ignored'/);
  assert.match(migration, /lp\.reconciliation_status = 'ignored'/);
});

test('product staging remains service-role only', () => {
  assert.match(migration, /revoke all on function public\.motil_ingest_laudus_products/);
  assert.match(migration, /grant execute on function public\.motil_ingest_laudus_products.*service_role/);
});
