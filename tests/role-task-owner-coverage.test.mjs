import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261108115000_add_role_task_owner_coverage_v1.sql', import.meta.url);

test('owner coverage health proves every actionable owner task has an active profile', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /role_task_owner_coverage_v1/);
  assert.match(sql, /role_tasks_actionable_v1/);
  assert.match(sql, /responsibility='owner'/);
  assert.match(sql, /status='pending'/);
  assert.match(sql, /profiles/);
  assert.match(sql, /status='active'/);
  assert.match(sql, /has_active_owner/);
});

test('owner coverage health is read only and service-role scoped', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.doesNotMatch(sql, /update\s+/i);
  assert.doesNotMatch(sql, /insert\s+into/i);
  assert.doesNotMatch(sql, /delete\s+from/i);
  assert.match(sql, /revoke all .* from public,anon,authenticated/i);
  assert.match(sql, /grant select .* to service_role/i);
});
