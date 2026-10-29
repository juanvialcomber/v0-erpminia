import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261029231500_map_laudus_warehouse_002.sql', import.meta.url);

test('warehouse 002 mapping is exact, bounded and aborts on drift', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /code='002'/);
  assert.match(sql, /name='Bodega Central'/);
  assert.match(sql, /reconciliation_status='new_candidate'/);
  assert.match(sql, /motil_warehouse_id is null/);
  assert.match(sql, /reconciliation_status='matched'/);
  assert.match(sql, /v_count <> 1/);
  assert.match(sql, /if not found then/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.doesNotMatch(sql, /insert\s+into\s+public\.warehouses/i);
});
