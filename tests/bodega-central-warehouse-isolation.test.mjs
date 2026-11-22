import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const file = (path) => readFileSync(resolve(process.cwd(), path), 'utf8');
const migration = file('supabase/migrations/20261122030000_compare_laudus_with_operational_warehouse_stock.sql');
const materialsApi = file('app/api/bodega/maintenance-supply/route.ts');
const previewMigration = file('supabase/migrations/20261122033000_laudus_central_canonicalization_preview.sql');

test('Central (002) reconciliation never rewrites the existing organization-wide Laudus reporting view', () => {
  assert.match(migration, /create or replace view public\.laudus_central_warehouse_stock_reconciliation_v1\s+with \(security_invoker = true\)/i);
  assert.doesNotMatch(migration, /(?:create|drop|alter)\s+(?:or replace\s+)?view\s+public\.laudus_inventory_reconciliation_service_v1\b/i);
  assert.match(migration, /revoke all on public\.laudus_central_warehouse_stock_reconciliation_v1 from public, anon, authenticated/i);
  assert.match(migration, /grant select on public\.laudus_central_warehouse_stock_reconciliation_v1 to service_role/i);
});

test('Central comparison matches only mapped warehouse 002 and does not assume historic MOTIL stock locations', () => {
  assert.match(migration, /external_id\s*=\s*'002'/);
  assert.match(migration, /s\.warehouse_external_id\s*=\s*w\.external_id/);
  assert.match(migration, /w\.motil_warehouse_id\s*=\s*b\.warehouse_id/);
  assert.match(migration, /add column if not exists warehouse_id uuid references public\.warehouses\(id\)/i);
  assert.doesNotMatch(migration, /update\s+public\.warehouse_stock/i);
});

test('Bodega-to-maintenance material view reads the isolated Central source', () => {
  assert.match(materialsApi, /\.from\('laudus_central_warehouse_stock_reconciliation_v1'\)/);
  assert.doesNotMatch(materialsApi, /\.from\('laudus_inventory_reconciliation_service_v1'\)/);
  assert.match(materialsApi, /\.eq\('organization_id', context\.organizationId\)/);
  assert.match(materialsApi, /readOnly:\s*true/);
});

test('Central preview retains manual reviews for stale, negative, fractional and existing balances', () => {
  for (const state of [
    'review_stale_source',
    'review_negative_source',
    'review_fractional_precision',
    'review_existing_central_balance',
    'review_unassigned_balance_or_history',
  ]) assert.match(previewMigration, new RegExp(state));
  assert.doesNotMatch(previewMigration, /(?:update|delete from)\s+public\.warehouse_stock/i);
});
