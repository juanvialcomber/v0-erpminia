import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const sql = readFileSync(
  new URL('../supabase/migrations/20261027142000_production_latest_october_cutoff.sql', import.meta.url),
  'utf8',
);

test('October production sector view selects the newest canonical cutoff', () => {
  assert.match(sql, /max\(cutoff_date\)/);
  assert.match(sql, /canonical_role='canonical'/);
  assert.match(sql, /source_kind='actual'/);
  assert.match(sql, /period_start='2026-10-01'/);
});

test('October production sector view is not pinned to a filename or SHA', () => {
  assert.doesNotMatch(sql, /14 DE OCTUBRE/i);
  assert.doesNotMatch(sql, /9faaf58ac6f4aa905aa0a3ff029b74d319c864418945dfd331ae72ec57d0ca84/i);
  assert.match(sql, /production_source_normalized_records/);
  assert.match(sql, /production_source_documents/);
});

test('October production sector view preserves source errors and blank actuals', () => {
  assert.match(sql, /source_formula_error/);
  assert.match(sql, /source_actual_blank/);
  assert.match(sql, /SOURCE_ONLY/);
});
