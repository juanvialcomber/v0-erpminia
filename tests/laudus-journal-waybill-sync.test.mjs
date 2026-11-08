import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029221000_laudus_journal_waybill_sync_domains.sql','utf8');
const provenanceMigration = fs.readFileSync('supabase/migrations/20261108144500_separate_laudus_waybill_header_line_provenance.sql','utf8');
const coreRoute = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('journal and waybill sync use verified Swagger v2 list paths',()=>{
  assert.match(sync,/\/accounting\/journal\/entries\/list/);
  assert.match(sync,/\/purchases\/waybills\/list/);
  assert.match(sync,/JOURNAL_FIELDS/);
  assert.match(sync,/PURCHASE_WAYBILL_FIELDS/);
});

test('journal delta is bounded ordered by date and remains staging-only',()=>{
  assert.match(sync,/listRecent\('\/accounting\/journal\/entries\/list', 'date', JOURNAL_FIELDS, 2\)/);
  assert.match(sync,/motil_ingest_laudus_extended_finance/);
  assert.doesNotMatch(sync,/\.insert\(|\.update\(|\.delete\(/);
  assert.match(sync,/canonicalMutated: false/);
});

test('waybills preserve supplier warehouse and product evidence from v2',()=>{
  for (const field of ['purchaseWaybillId','supplier_supplierId','supplier_VATId','warehouse_warehouseId','items_product_sku','items_quantity']) {
    assert.match(sync,new RegExp(field));
  }
  assert.match(sync,/motil_ingest_laudus_waybill_rows/);
  assert.match(sync,/contract: 'swagger_v2'/);
});

test('consolidated cron executes verified journal and waybill domains',()=>{
  assert.match(migration,/accounting_entries/);
  assert.match(migration,/waybills/);
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-core-daily'),'20 5 * * *');
  assert.match(coreRoute,/syncLaudusAccountingEntries/);
  assert.match(coreRoute,/syncLaudusPurchaseWaybills/);
});


test('journal staging normalizes blank or non-numeric debit and credit values before RPC',()=>{
  assert.match(sync,/normalizeNumberish/);
  assert.match(sync,/debit:\s*normalizeNumberish\(line\?\.debit\)/);
  assert.match(sync,/credit:\s*normalizeNumberish\(line\?\.credit\)/);
  assert.match(sync,/normalizeJournalRows\(listed\.rows\)/);
});


test('journal staging groups repeated journalEntryId values without dropping distinct lines',()=>{
  assert.match(sync,/function normalizeJournalRows/);
  assert.match(sync,/new Map<string, JsonRow>/);
  assert.match(sync,/flatLineId = row\.lines_lineId/);
  assert.match(sync,/lineMap\.set\(lineKey\(normalizedFlatLine\), normalizedFlatLine\)/);
  assert.match(sync,/lines: \[\.\.\.lineMap\.values\(\)\]/);
  assert.match(sync,/duplicatesRemoved/);
});


test('journal sync observability separates grouped line rows from real duplicates',()=>{
  assert.match(sync,/flattenedLineRowsGrouped/);
  assert.match(sync,/duplicatesRemoved: 0/);
});


test('waybill header provenance excludes line-level item evidence',()=>{
  assert.match(provenanceMigration,/v_header_payload := v_row - array\[/);
  assert.match(provenanceMigration,/'items_product_sku'/);
  assert.match(provenanceMigration,/'items_quantity'/);
  assert.match(provenanceMigration,/source_payload=excluded\.source_payload/);
  assert.match(provenanceMigration,/update integration\.laudus_waybills/);
  assert.doesNotMatch(provenanceMigration,/update integration\.laudus_waybill_lines\s+set\s+quantity/i);
});
