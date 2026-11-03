import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const backfill = fs.readFileSync('lib/integrations/laudus/accounting-backfill.ts','utf8');
const route = fs.readFileSync('app/api/cron/laudus-accounting-backfill/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103115000_laudus_accounting_backfill_state.sql','utf8');
const backfillLeaseMigration = fs.readFileSync('supabase/migrations/20261103162500_laudus_accounting_backfill_lease.sql','utf8');
const stockRoute = fs.readFileSync('app/api/cron/laudus-stock-daily/route.ts','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('accounting backfill uses wider date windows and stable pagination',()=>{
  assert.match(backfill,/WINDOW_DAYS = 31/);
  assert.match(backfill,/field: 'date', operator: '>='/);
  assert.match(backfill,/field: 'date', operator: '<='/);
  assert.match(backfill,/field: 'date', direction: 'ASC'/);
  assert.match(backfill,/field: 'journalEntryId', direction: 'ASC'/);
  assert.match(backfill,/nextOffset/);
});

test('accounting backfill is bounded and deduplicates before staging',()=>{
  assert.match(backfill,/Math\.min\(Math\.max\(Math\.trunc\(maxCalls\), 1\), 30\)/);
  assert.match(backfill,/normalizeAndDedupe/);
  assert.match(backfill,/motil_ingest_laudus_extended_finance/);
  assert.match(backfill,/duplicatesRemoved/);
});

test('accounting backfill checkpoints each successful page under a lease',()=>{
  assert.match(backfill,/motil_acquire_laudus_accounting_backfill_lease/);
  assert.match(backfill,/motil_checkpoint_laudus_accounting_backfill_v2/);
  assert.match(backfill,/await checkpoint\(db,/);
});

test('accounting backfill cron preserves secret and monthly reserve',()=>{
  assert.match(route,/CRON_SECRET/);
  assert.match(route,/MAX_CALLS_PER_RUN = 30/);
  assert.match(route,/MINIMUM_RESERVE = 200/);
  assert.match(route,/monthly_remaining_exact/);
  assert.match(route,/withLaudusApiUsageTracking/);
});

test('accounting backfill state remains service-only',()=>{
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on integration\.laudus_accounting_backfill_state from public, anon, authenticated/);
  assert.match(migration,/grant execute on function public\.motil_get_laudus_accounting_backfill_state\(uuid\)\s+to service_role/);
  assert.match(migration,/grant execute on function public\.motil_update_laudus_accounting_backfill_state/);
});

test('accounting backfill one-shot ops schedule is explicit',()=>{
  const job=vercel.crons.find((cron)=>cron.path==='/api/cron/laudus-accounting-backfill');
  assert.ok(job);
  assert.equal(job.schedule,'50 16 3 11 *');
});


test('accounting backfill initializes from the first historical gap even if recent rows already exist',()=>{
  assert.match(migration,/lag\(d\) over\(order by d\)/);
  assert.match(migration,/gap_days > 31/);
  assert.match(migration,/select g\.prev_d \+ 1/);
  assert.match(migration,/select max\(d\) \+ 1/);
});


test('accounting backfill lease is atomic, expiring and service-role only',()=>{
  assert.match(backfillLeaseMigration,/lease_token uuid/);
  assert.match(backfillLeaseMigration,/lease_expires_at timestamptz/);
  assert.match(backfillLeaseMigration,/lease_expires_at is null or lease_expires_at <= now\(\)/);
  assert.match(backfillLeaseMigration,/motil_acquire_laudus_accounting_backfill_lease/);
  assert.match(backfillLeaseMigration,/motil_checkpoint_laudus_accounting_backfill_v2/);
  assert.match(backfillLeaseMigration,/motil_release_laudus_accounting_backfill_lease/);
  assert.match(backfillLeaseMigration,/from public, anon, authenticated/);
  assert.match(backfillLeaseMigration,/to service_role/);
});

test('accounting backfill requires the lease token for every checkpoint',()=>{
  assert.match(backfill,/motil_acquire_laudus_accounting_backfill_lease/);
  assert.match(backfill,/motil_checkpoint_laudus_accounting_backfill_v2/);
  assert.match(backfill,/p_lease_token: args\.leaseToken/);
  assert.match(backfill,/skipped_locked/);
  assert.match(backfill,/motil_release_laudus_accounting_backfill_lease/);
});

test('known stock cron provides a budgeted fallback for accounting backfill',()=>{
  assert.match(stockRoute,/runLaudusAccountingBackfill/);
  assert.match(stockRoute,/BACKFILL_FALLBACK_CALLS = 30/);
  assert.match(stockRoute,/BACKFILL_MONTHLY_RESERVE = 200/);
  assert.match(stockRoute,/monthly_remaining_exact/);
  assert.match(stockRoute,/after\(async \(\) =>/);
  assert.match(stockRoute,/accounting backfill fallback completed/);
});
