import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync(
  'supabase/migrations/20261109132000_laudus_missing_supplier_recovery_candidates.sql',
  'utf8',
);

test('missing supplier recovery is review-only and never canonicalizes automatically',()=>{
  assert.match(migration,/laudus_missing_supplier_recovery_candidates_v2/);
  assert.match(migration,/invalido_sin_proveedor/);
  assert.match(migration,/quality_status = 'verificado'/);
  assert.match(migration,/alta_confianza/);
  assert.match(migration,/evidencia_historica_no_canonica/);
  assert.doesNotMatch(migration,/update\s+/i);
  assert.doesNotMatch(migration,/insert\s+into/i);
  assert.doesNotMatch(migration,/delete\s+from/i);
});

test('high confidence requires support, score, and separation from the runner-up',()=>{
  assert.match(migration,/score >= 12/);
  assert.match(migration,/score >= r\.second_score \+ 5/);
  assert.match(migration,/local_support >= 3/);
  assert.match(migration,/candidate_rank = 1/);
});

test('candidate evidence stays bounded around document sequence and date',()=>{
  assert.match(migration,/<= 500/);
  assert.match(migration,/<= 60/);
  assert.match(migration,/<= 180/);
  assert.match(migration,/exact_amount_hits/);
  assert.match(migration,/min_folio_gap/);
  assert.match(migration,/min_date_gap/);
});
