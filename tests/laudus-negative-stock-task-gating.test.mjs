import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261107194500_gate_negative_stock_tasks_on_kardex.sql', import.meta.url);

test('negative stock is not assigned to Bodega before automatic Kardex evidence exists', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /laudus:negative_stock:%/);
  assert.match(sql, /laudus_negative_stock_positions_service_v1/);
  assert.match(sql, /laudus_product_kardex_latest_service_v1/);
  assert.match(sql, /product_external_id=n\.product_external_id/);
  assert.match(sql, /upper\(n\.sku\)=upper\(split_part\(d\.issue_key, ':', 3\)\)/);
});

test('non-negative inventory reconciliation remains directly actionable', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /d\.issue_key not like 'laudus:negative_stock:%'/);
  assert.match(sql, /laudus:inventory_mismatch:%/);
});
