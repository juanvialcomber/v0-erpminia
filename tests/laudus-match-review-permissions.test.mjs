import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('Laudus match feedback is append-only for the application service role',()=>{
  const sql=fs.readFileSync('supabase/migrations/20261023222500_harden_laudus_match_review_permissions.sql','utf8');
  assert.match(sql,/revoke all .* service_role/);
  assert.match(sql,/grant select, insert .* service_role/);
  assert.doesNotMatch(sql,/grant .*update/i);
  assert.doesNotMatch(sql,/grant .*delete/i);
});
