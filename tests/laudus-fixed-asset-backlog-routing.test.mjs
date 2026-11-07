import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL('../supabase/migrations/20261107193700_route_laudus_fixed_asset_backlog_actions.sql', import.meta.url);

test('Laudus fixed asset backlog is aggregated by accountable area', async () => {
  const sql = await readFile(migrationPath, 'utf8');

  assert.match(sql, /laudus_fixed_asset_triage_v1/);
  assert.match(sql, /group by t\.organization_id,c\.id,c\.name,t\.triage_bucket/);
  assert.match(sql, /human_action_now=false/);
  assert.match(sql, /laudus-fixed-asset-backlog:/);
  assert.match(sql, /laudus_fixed_asset_triage_v1/);
  assert.match(sql, /responsible_cargo_name/);
  assert.match(sql, /upper\(c\.name\)=upper\(t\.responsible_cargo_name\)/i);
  assert.doesNotMatch(sql, /laudus-fixed-asset-backlog:'::text \|\| t\.external_id/);
});
