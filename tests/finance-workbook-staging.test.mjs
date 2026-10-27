import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const route = fs.readFileSync('app/api/finance/workbook-imports/[id]/stage/route.ts','utf8');

test('finance workbook staging preserves source lineage and never promotes automatically',()=>{
  assert.match(route,/source_sha256/);
  assert.match(route,/source_sheet/);
  assert.match(route,/source_row/);
  assert.match(route,/promoted_to_canonical:\s*false/);
  assert.match(route,/sourceImport\.source_sha256/);
  assert.match(route,/actualSha256 !== sourceImport\.source_sha256/);
});

test('insurance workbook uses physical Excel row numbers and exact identifiers only',()=>{
  assert.match(route,/const sourceRow = index \+ 1/);
  assert.match(route,/license_plate_exact/);
  assert.match(route,/serial_exact/);
  assert.doesNotMatch(route,/fuzzy|similarity|levenshtein/i);
  assert.match(route,/rows\.length !== 133/);
});

test('depreciation workbook stays review-only and preserves the known wide-row anomaly',()=>{
  assert.match(route,/sender_declared_not_final:\s*true/);
  assert.match(route,/sourceRow === 771/);
  assert.match(route,/anomaly_wide_row/);
  assert.match(route,/net_book_value_mismatch/);
  assert.match(route,/total_accumulated_depreciation_mismatch/);
  assert.match(route,/review_flags/);
  assert.match(route,/counts\.fixed_asset_owned !== 739/);
  assert.match(route,/counts\.fixed_asset_used !== 77/);
  assert.match(route,/counts\.fixed_asset_leasing !== 64/);
  assert.match(route,/rows\.length !== 880/);
});

test('reimport refuses to replace rows that were already promoted',()=>{
  assert.match(route,/promoted_to_canonical.*true/s);
  assert.match(route,/La fuente ya tiene filas promovidas a canónico/);
  assert.match(route,/delete\(\).*promoted_to_canonical.*false/s);
});
