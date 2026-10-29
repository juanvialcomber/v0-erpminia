import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261029230500_harden_laudus_api_budget_view.sql', import.meta.url);

test('Laudus budget view grants service role read only', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /revoke all on public\.laudus_api_budget_service_v1 from service_role/i);
  assert.match(sql, /grant select on public\.laudus_api_budget_service_v1 to service_role/i);
  assert.doesNotMatch(sql, /grant .*insert|grant .*update|grant .*delete/i);
});
