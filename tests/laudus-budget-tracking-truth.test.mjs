import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261029230000_laudus_budget_tracking_truth.sql', import.meta.url);

test('Laudus budget never reports exact remaining headroom from partial-month tracking', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /min\(u\.first_called_at\) as exact_tracking_from/i);
  assert.match(sql, /then greatest\(2000 - tracked_calls_this_month, 0\)::integer\s+else null::integer/i);
  assert.match(sql, /pending_first_tracked_call/);
  assert.match(sql, /partial_month/);
  assert.match(sql, /full_month/);
  assert.match(sql, /monthly_remaining_exact/);
  assert.match(sql, /tracked_remaining is NULL unless the ledger covers the full current calendar month/i);
});

test('Laudus budget view remains server-only', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /revoke all on public\.laudus_api_budget_service_v1 from public, anon, authenticated/i);
  assert.match(sql, /grant select on public\.laudus_api_budget_service_v1 to service_role/i);
});
