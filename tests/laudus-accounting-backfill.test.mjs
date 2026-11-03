import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const backfill = fs.readFileSync('lib/integrations/laudus/accounting-backfill.ts','utf8');
const route = fs.readFileSync('app/api/cron/laudus-accounting-backfill/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103115000_laudus_accounting_backfill_state.sql','utf8');
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

test('accounting backfill checkpoints each successful page',()=>{
  assert.match(backfill,/motil_get_laudus_accounting_backfill_state/);
  assert.match(backfill,/motil_update_laudus_accounting_backfill_state/);
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

test('accounting backfill runs every three hours',()=>{
  const job=vercel.crons.find((cron)=>cron.path==='/api/cron/laudus-accounting-backfill');
  assert.ok(job);
  assert.equal(job.schedule,'35 */3 * * *');
});


test('accounting backfill initializes from the first historical gap even if recent rows already exist',()=>{
  assert.match(migration,/lag\(d\) over\(order by d\)/);
  assert.match(migration,/gap_days > 31/);
  assert.match(migration,/select g\.prev_d \+ 1/);
  assert.match(migration,/select max\(d\) \+ 1/);
});
