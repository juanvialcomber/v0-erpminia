import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../scripts/import-hse-spreadsheet-rows.mjs', import.meta.url), 'utf8');
test('HSE import remains read-only by default and is restricted to MOTIL', () => {
  assert.match(source, /const apply = process\.argv\.includes\('--apply'\)/);
  assert.match(source, /const expected = 'ttlptyheuqeotadtcbaw'/);
  assert.match(source, /if \(documents\.length !== 5\)/);
  assert.match(source, /if\s*\(files\s*!==\s*documents\.length\s*\|\|\s*candidates\s*===\s*0\)/);
});
test('HSE source import never auto-approves a fact', () => {
  assert.match(source, /'pending',array\['Awaiting HSE applicability review'\]/);
  assert.match(source, /on conflict \(source_document_id,source_sheet,source_row,source_hash\) do nothing/);
  assert.doesNotMatch(source, /insert into canonical\.hse_documents/i);
  assert.doesNotMatch(source, /insert into canonical\.hse_document_controls/i);
});
