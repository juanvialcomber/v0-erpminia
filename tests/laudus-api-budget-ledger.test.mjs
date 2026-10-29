import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const migration = fs.readFileSync('supabase/migrations/20261029204000_laudus_api_usage_ledger.sql','utf8');
const usage = fs.readFileSync('lib/integrations/laudus/api-usage.ts','utf8');
const client = fs.readFileSync('lib/integrations/laudus/client.ts','utf8');
const products = fs.readFileSync('app/api/cron/laudus-products-daily/route.ts','utf8');
const stock = fs.readFileSync('app/api/cron/laudus-stock-daily/route.ts','utf8');
const finance = fs.readFileSync('app/api/cron/laudus-financial-masters-daily/route.ts','utf8');
const smoke = fs.readFileSync('app/api/integrations/laudus/smoke/route.ts','utf8');
const bank = fs.readFileSync('app/api/integrations/laudus/bank-reconciliation/route.ts','utf8');

test('usage ledger is private, daily and service-role only',()=>{
  assert.match(migration,/integration\.laudus_api_usage_daily/);
  assert.match(migration,/unique \(source_id, usage_date\)/);
  assert.match(migration,/enable row level security/);
  assert.match(migration,/revoke all on integration\.laudus_api_usage_daily from public, anon, authenticated/);
  assert.match(migration,/grant select, insert, update on integration\.laudus_api_usage_daily to service_role/);
  assert.match(migration,/monthly_limit/);
  assert.match(migration,/2000/);
});

test('client records every actual outbound request including failures and login',()=>{
  assert.match(client,/noteLaudusApiRequest\(path, response\.status\)/);
  assert.match(client,/noteLaudusApiRequest\(path, 0\)/);
  assert.match(usage,/endpoint === '\/security\/login'/);
  assert.match(usage,/state\.errors \+= 1/);
});

test('tracking persists through service-role RPC without breaking the business operation',()=>{
  assert.match(usage,/AsyncLocalStorage/);
  assert.match(usage,/motil_record_laudus_api_usage/);
  assert.match(usage,/p_request_count: state\.requests/);
  assert.match(usage,/p_endpoint_counts: state\.endpoints/);
  assert.match(usage,/persistence unavailable/);
});

test('all current Laudus execution entrypoints are usage-tracked',()=>{
  for (const source of [products,stock,finance,smoke,bank]) {
    assert.match(source,/withLaudusApiUsageTracking/);
  }
});


test('usage-tracked routes fail closed when organization context is missing',()=>{
  assert.match(bank,/Organización no disponible/);
  assert.match(smoke,/Organización no disponible/);
});
