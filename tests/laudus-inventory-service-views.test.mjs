import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261029133000_laudus_inventory_reconciliation_service.sql', import.meta.url),
  'utf8',
);

test('Laudus inventory reconciliation views are server-only and read-only projections', () => {
  for (const view of [
    'laudus_inventory_reconciliation_service_v1',
    'laudus_inventory_reconciliation_summary_service_v1',
    'laudus_inventory_readiness_service_v1',
  ]) {
    assert.match(migration, new RegExp('view public\\.' + view));
    assert.match(migration, new RegExp('revoke all on public\\.' + view + ' from public, anon, authenticated'));
    assert.match(migration, new RegExp('grant select on public\\.' + view + ' to service_role'));
  }

  assert.match(migration, /security_invoker = true/);
  assert.doesNotMatch(migration, /\bupdate\s+public\.bodega_inventory\b/i);
  assert.doesNotMatch(migration, /\binsert\s+into\s+public\.bodega_inventory\b/i);
  assert.doesNotMatch(migration, /\bdelete\s+from\s+public\.bodega_inventory\b/i);
});

test('reconciliation uses reported decimal quantity and preserves zero tolerance', () => {
  assert.match(migration, /coalesce\(b\.quantity_reported, b\.quantity::numeric\)/i);
  assert.match(migration, /<= 0\.005/);
  assert.match(migration, /missing_in_motil/);
  assert.match(migration, /laudus_only_zero/);
  assert.match(migration, /quantity_mismatch/);
  assert.match(migration, /aligned/);
});
