import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261107194400_remove_informational_laudus_asset_backlog_tasks.sql', import.meta.url);

test('Mi trabajo excludes informational Laudus fixed-asset backlog', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.doesNotMatch(sql, /laudus-fixed-asset-backlog:/);
  assert.doesNotMatch(sql, /human_action_now=false/);
  assert.match(sql, /laudus-fixed-asset:/);
  assert.match(sql, /d\.status = 'open'/);
  assert.match(sql, /laudus:fixed_asset_identity:%/);
});

test('actionable Laudus finance inventory receipt and bank work remain routed', async () => {
  const sql = await readFile(migrationPath, 'utf8');
  assert.match(sql, /laudus-reconciliation:/);
  assert.match(sql, /laudus-finance-reconciliation:/);
  assert.match(sql, /procurement-receipt-backlog/);
  assert.match(sql, /laudus-bank-evidence-gap/);
});
