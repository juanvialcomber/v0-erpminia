import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const sync = fs.readFileSync('lib/integrations/laudus/bank-statement-sync.ts','utf8');
const route = fs.readFileSync('app/api/cron/laudus-bank-statements-daily/route.ts','utf8');
const policy = fs.readFileSync('lib/integrations/laudus/sync-policy.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261029215500_laudus_bank_statement_sync_domain.sql','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('bank statement sync uses the existing verified Laudus bank statement list endpoint',()=>{
  assert.match(sync,/\/accounting\/bankStatements\/list/);
  assert.match(sync,/bankStatementId/);
  assert.match(sync,/motil_ingest_laudus_extended_finance/);
});

test('bank statement sync stays bounded read-only and usage tracked',()=>{
  assert.match(sync,/limit: 25/);
  assert.match(sync,/canonicalMutated: false/);
  assert.match(sync,/laudusMutated: false/);
  assert.match(route,/withLaudusApiUsageTracking/);
  assert.doesNotMatch(sync,/\.insert\(|\.update\(|\.delete\(/);
});

test('bank statement sync has a daily control-plane domain',()=>{
  assert.match(policy,/bank_statements/);
  assert.match(migration,/bank_statements/);
  assert.match(migration,/v_now \+ interval '24 hours'/);
});

test('bank statement cron is staggered after procurement and weekly master crons',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-bank-statements-daily'), '10 7 * * *');
});
