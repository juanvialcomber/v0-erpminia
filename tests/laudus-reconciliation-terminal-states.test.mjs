import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(
  new URL('../supabase/migrations/20261027152000_laudus_reconciliation_terminal_states.sql', import.meta.url),
  'utf8',
);

test('discontinued Laudus cost centers stay ignored',()=>{
  assert.match(sql,/when l\.discontinued then 'ignored'/);
  assert.match(sql,/count\(\*\) filter \(where reconciliation_status='pending'\)/);
});

test('reconciliation items preserve terminal and review states',()=>{
  assert.match(sql,/when 'ignored' then 'ignored'/);
  assert.match(sql,/when 'candidate' then 'new_candidate'/);
  assert.match(sql,/when 'conflict' then 'conflict'/);
  assert.match(sql,/else 'pending'/);
});

test('fixed asset pending count excludes candidate and ignored',()=>{
  assert.match(sql,/'fixed_assets_candidate'/);
  assert.match(sql,/'fixed_assets_ignored'/);
  assert.doesNotMatch(sql,/count\(\*\) filter \(where reconciliation_status<>'matched'\)/);
});
