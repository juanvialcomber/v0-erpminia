import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029221000_laudus_journal_waybill_sync_domains.sql','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('journal and waybill sync use exact Swagger v2 list paths',()=>{
  assert.match(sync,/\/accounting\/journal\/entries\/list/);
  assert.match(sync,/\/purchases\/waybills\/list/);
});

test('both deltas are bounded to latest 200 and remain staging-only',()=>{
  assert.match(sync,/listRecent\('\/accounting\/journal\/entries\/list', 'modifiedAt', 2\)/);
  assert.match(sync,/listRecent\('\/purchases\/waybills\/list', 'issuedDate', 2\)/);
  assert.match(sync,/motil_ingest_laudus_extended_finance/);
  assert.match(sync,/motil_ingest_laudus_waybill_rows/);
  assert.doesNotMatch(sync,/\.insert\(|\.update\(|\.delete\(/);
  assert.match(sync,/canonicalMutated: false/);
});

test('waybills preserve supplier warehouse and item evidence',()=>{
  for (const field of ['purchaseWaybillId','supplier_supplierId','supplier_VATId','warehouse_warehouseId','items_product_sku','items_quantity']) {
    assert.match(sync,new RegExp(field));
  }
});

test('sync control and cron schedules include new daily domains',()=>{
  assert.match(migration,/accounting_entries/);
  assert.match(migration,/waybills/);
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-accounting-entries-daily'),'40 7 * * *');
  assert.equal(byPath.get('/api/cron/laudus-waybills-daily'),'10 8 * * *');
});
