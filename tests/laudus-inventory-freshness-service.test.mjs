import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const migration = readFileSync(
  new URL('../supabase/migrations/20261122134000_restore_laudus_inventory_freshness_summary_v1.sql', import.meta.url),
  'utf8',
);
const helper = readFileSync(
  new URL('../lib/integrations/laudus/inventory-readiness.ts', import.meta.url),
  'utf8',
);

test('restored inventory freshness view exports exactly the API-required counters', () => {
  assert.match(migration, /create or replace view public\.laudus_inventory_freshness_summary_service_v1/);
  for (const field of [
    'organization_id', 'quantity_mismatches', 'fresh_mismatches_1d',
    'stale_mismatches_7d', 'stale_mismatches_30d',
    'latest_laudus_stock_sync', 'latest_motil_stock_update',
  ]) {
    assert.match(migration, new RegExp('\\b' + field + '\\b'));
    assert.match(helper, new RegExp('\\b' + field + '\\b'));
  }
});

test('view derives from existing reconciled source and never mutates operational stock', () => {
  assert.match(migration, /from public\.laudus_inventory_reconciliation_service_v1/);
  assert.match(migration, /group by organization_id/);
  assert.match(migration, /reconciliation_state = 'quantity_mismatch'/);
  assert.doesNotMatch(migration, /\b(?:update|delete|insert|truncate)\s+(?:from\s+|into\s+)?(?:public\.)?(?:warehouse_stock|stock_movements|bodega_inventory)\b/i);
  assert.doesNotMatch(migration, /\bcreate\s+materialized\s+view\b/i);
});

test('missing evidence times do not count as fresh or stale', () => {
  assert.match(migration, /source_observed_at is not null/);
  assert.match(migration, /motil_observed_at is not null/);
  assert.match(migration, /coalesce\(source_date_to, laudus_synced_at\)/);
  assert.match(migration, /motil_updated_at at time zone 'UTC'/);
  assert.match(migration, /source_observed_at - interval '7 days'/);
  assert.match(migration, /source_observed_at - interval '30 days'/);
});

test('PostgREST service view is server-only and does not elevate anonymous permissions', () => {
  assert.match(migration, /with \(security_invoker = true\)/);
  assert.match(migration, /revoke all on public\.laudus_inventory_freshness_summary_service_v1\s+from public, anon, authenticated;/);
  assert.match(migration, /grant select on public\.laudus_inventory_freshness_summary_service_v1\s+to service_role;/);
  assert.doesNotMatch(migration, /grant (?:all|select) on .* to (?:anon|authenticated)/i);
});
