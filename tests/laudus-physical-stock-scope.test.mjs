import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync(
  'supabase/migrations/20261029163000_laudus_physical_stock_scope.sql',
  'utf8',
);

test('effective Laudus stock only uses the four physical warehouse codes', () => {
  assert.match(migration, /warehouse_external_id in \('001','002','003','004'\)/);
  assert.match(migration, /sum\(s\.stock\) filter/);
  assert.match(migration, /count\(s\.id\) filter/);
  assert.match(migration, /max\(s\.synced_at\) filter/);
  assert.doesNotMatch(migration, /warehouse_external_id in \('005','006','007'\)/);
});

test('readiness ignores terminal product reviews and nonphysical warehouse candidates', () => {
  assert.match(migration, /lp\.reconciliation_status = 'ignored'/);
  assert.match(migration, /w\.external_id in \('001','002','003','004'\)/);
  assert.match(migration, /open_reconciliation/);
});

test('physical-stock projections remain read-only service-role surfaces', () => {
  assert.match(migration, /security_invoker = true/);
  assert.match(migration, /revoke all on public\.laudus_inventory_reconciliation_service_v1/);
  assert.match(migration, /grant select on public\.laudus_inventory_reconciliation_service_v1 to service_role/);
  assert.doesNotMatch(migration, /insert into canonical/i);
  assert.doesNotMatch(migration, /update public\.bodega_inventory/i);
});
