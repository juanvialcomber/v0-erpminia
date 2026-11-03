import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029221000_laudus_journal_waybill_sync_domains.sql','utf8');
const coreRoute = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('journal sync uses the verified current list contract',()=>{
  assert.match(sync,/\/accounting\/journal\/entries\/list/);
  assert.match(sync,/JOURNAL_FIELDS/);
  assert.match(sync,/journalEntryId/);
  assert.match(sync,/journalEntryNumber/);
  assert.match(sync,/lines\.account\.accountNumber/);
});

test('journal delta is bounded ordered by date and remains staging-only',()=>{
  assert.match(sync,/listRecent\('\/accounting\/journal\/entries\/list', 'date', JOURNAL_FIELDS, 2\)/);
  assert.match(sync,/motil_ingest_laudus_extended_finance/);
  assert.doesNotMatch(sync,/\.insert\(|\.update\(|\.delete\(/);
  assert.match(sync,/canonicalMutated: false/);
});

test('unverified waybill polling is disabled without consuming Laudus calls',()=>{
  assert.match(sync,/status: 'unsupported'/);
  assert.match(sync,/apiCalls: 0/);
  assert.match(sync,/waybill list endpoint is not verified/);
});

test('sync control keeps historical waybill domain but consolidated cron executes verified journal only',()=>{
  assert.match(migration,/accounting_entries/);
  assert.match(migration,/waybills/);
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-core-daily'),'20 5 * * *');
  assert.match(coreRoute,/syncLaudusAccountingEntries/);
  assert.doesNotMatch(coreRoute,/syncLaudusPurchaseWaybills/);
});
