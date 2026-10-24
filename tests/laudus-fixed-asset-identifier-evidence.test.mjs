import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration=fs.readFileSync('supabase/migrations/20261024100000_laudus_fixed_asset_identifier_evidence.sql','utf8');

test('asset resolver promotes deterministic identifiers as evidence only',()=>{
  assert.match(migration,/exact_plate_support/);
  assert.match(migration,/exact_serial_support/);
  assert.match(migration,/strong_identifier_candidate/);
  assert.match(migration,/model_support/);
  assert.match(migration,/manufacturer_support/);
});

test('asset resolver never mutates canonical or Laudus identity',()=>{
  assert.doesNotMatch(migration,/update canonical\.assets/i);
  assert.doesNotMatch(migration,/update integration\.laudus_fixed_assets/i);
  assert.doesNotMatch(migration,/insert into canonical\.assets/i);
  assert.match(migration,/all identity promotion requires human review/i);
});
