import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20261104143000_reopen_laudus_quality_incidents.sql','utf8');

test('recurring Laudus data-quality incident reopens the same fingerprint',()=>{
  assert.match(migration,/status='open'/);
  assert.match(migration,/resolved_at=null/);
  assert.match(migration,/resolved_by=null/);
  assert.match(migration,/v_reopened/);
  assert.match(migration,/fingerprint=v_fingerprint/);
});

test('incident reconciliation remains service-role only',()=>{
  assert.match(migration,/revoke all on function public\.motil_reconcile_laudus_data_quality_incidents/);
  assert.match(migration,/to service_role/);
});
