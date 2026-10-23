import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const sql=fs.readFileSync('supabase/migrations/20261024014500_value_scorecard_rpc.sql','utf8');
const api=fs.readFileSync('app/api/admin/value-scorecard/route.ts','utf8');

test('value scorecard uses one backend-only RPC contract',()=>{
  assert.match(sql,/motil_value_scorecard_preview/);
  assert.match(sql,/revoke all on function/);
  assert.match(sql,/grant execute .*service_role/);
  assert.match(api,/rpc\('motil_value_scorecard_preview'/);
  assert.doesNotMatch(api,/from\('laudus_purchase_orders'/);
  assert.doesNotMatch(api,/from\('laudus_purchase_invoices'/);
});
