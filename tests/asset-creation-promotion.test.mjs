import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20261027131500_promote_asset_creation_requests.sql', import.meta.url),
  'utf8',
);

test('canonical asset promotion requires accepted human review and exact identity', () => {
  assert.match(sql, /r\.status='accepted'/);
  assert.match(sql, /v_kind not in \('plate','serial'\)/);
  assert.match(sql, /canonical\.assets/);
  assert.match(sql, /canonical_asset_id/);
});

test('asset identity uses existing plate or serial rather than invented sequence', () => {
  assert.match(sql, /v_asset_code := v_plate/);
  assert.match(sql, /v_asset_code := v_serial/);
  assert.doesNotMatch(sql, /nextval|sequence|row_number\(/i);
});

test('promotion preserves evidence and closes review state', () => {
  assert.match(sql, /reconciliation_evidence/);
  assert.match(sql, /historical_cost_center_code/);
  assert.match(sql, /set status='resolved'/);
  assert.match(sql, /state='created'/);
});

test('promotion function is backend only', () => {
  assert.match(sql, /security definer/i);
  assert.ok(sql.includes('revoke all on function public.motil_promote_asset_creation_requests(uuid,uuid,integer)'));
  assert.ok(sql.includes('from public,anon,authenticated;'));
  assert.match(sql, /grant execute .* to service_role/i);
});
