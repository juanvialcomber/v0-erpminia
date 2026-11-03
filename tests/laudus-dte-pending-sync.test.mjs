import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const client = fs.readFileSync('lib/integrations/laudus/client.ts','utf8');
const sync = fs.readFileSync('lib/integrations/laudus/dte-sync.ts','utf8');
const policy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');
const core = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103152000_laudus_dte_pending_sync_policy.sql','utf8');

test('Laudus DTE access is restricted to the exact read-only pending endpoint',()=>{
  assert.match(client,/path !== '\/DTE\/pending'/);
  assert.doesNotMatch(client,/path\.startsWith\('\/DTE\/'\)/);
});

test('pending DTE sync stages evidence without claiming historical completeness',()=>{
  assert.match(sync,/getLaudus\('\/DTE\/pending'\)/);
  assert.match(sync,/motil_ingest_laudus_extended_finance/);
  assert.match(sync,/p_dtes: uniqueRows/);
  assert.match(sync,/historicalComplete: false/);
  assert.match(sync,/canonicalMutated: false/);
  assert.match(sync,/readOnly: true/);
});

test('pending DTE sync deduplicates on document type and folio',()=>{
  assert.match(sync,/new Map<string, JsonRow>/);
  assert.match(sync,/docTypeId/);
  assert.match(sync,/docNumber/);
  assert.match(sync,/byDocument\.set/);
});

test('DTE is a first-class health domain and runs inside the core session',()=>{
  assert.match(policy,/\| 'dtes'/);
  assert.match(core,/syncLaudusDtePending/);
  assert.match(core,/run\('dtes'/);
  assert.match(core,/CORE_CALL_BUDGET = 20/);
});

test('DTE sync policy is daily, read-only and explicitly non-historical',()=>{
  assert.match(migration,/'dtes'/);
  assert.match(migration,/'20 5 \* \* \*'/);
  assert.match(migration,/'pending_snapshot'/);
  assert.match(migration,/'\/DTE\/pending'/);
  assert.match(migration,/'read_only', true/);
  assert.match(migration,/'historical_complete', false/);
  assert.match(migration,/'executed_in', 'laudus-core-daily'/);
});


test('sync control accepts DTE and gives it the same daily due policy',()=>{
  assert.match(migration,/accounting_entries','waybills','dtes'/);
  assert.match(migration,/accounting_entries','waybills','dtes'\) then v_now \+ interval '24 hours'/);
});
