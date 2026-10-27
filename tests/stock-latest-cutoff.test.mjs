import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql=readFileSync(
  new URL('../supabase/migrations/20261027145000_stock_latest_october_cutoff.sql', import.meta.url),
  'utf8',
);

test('October stock views choose latest canonical cutoff instead of pinned workbook',()=>{
  assert.match(sql,/max\(cutoff_date\)/);
  assert.match(sql,/canonical_role='canonical'/);
  assert.match(sql,/source_kind='actual'/);
  assert.doesNotMatch(sql,/Nueva stock al 14 de octubre/i);
  assert.doesNotMatch(sql,/76fe77bc999701db3ce535d3691e14e3c34d995ba56080a7b2c18888647e2702/i);
});

test('latest stock daily view preserves source cell evidence and bounded daily values',()=>{
  assert.match(sql,/daily_cells/);
  assert.match(sql,/jsonb_each/);
  assert.match(sql,/jsonb_typeof\(j\.value\)='number'/);
  assert.match(sql,/source_reported_not_canonical/);
});

test('latest stock reconciliation keeps all conservation checks',()=>{
  assert.match(sql,/don_jaime_sector_check/);
  assert.match(sql,/peumo_sector_check/);
  assert.match(sql,/transport_sources_check/);
  assert.match(sql,/stock_net_change_check/);
  assert.match(sql,/mineral_stock_components_check/);
});
