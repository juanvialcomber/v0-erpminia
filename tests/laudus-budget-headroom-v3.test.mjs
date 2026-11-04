import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));
const migration = fs.readFileSync('supabase/migrations/20261029224000_laudus_budget_headroom_v3.sql','utf8');
const coreRoute = fs.readFileSync('app/api/cron/laudus-core-daily/route.ts','utf8');

test('Laudus consolidated core and financial-master cadence preserve monthly budget headroom',()=>{
  const byPath = new Map(vercel.crons.map((cron) => [cron.path, cron.schedule]));
  assert.equal(byPath.get('/api/cron/laudus-core-daily'),'20 5 * * *');
  assert.equal(byPath.get('/api/cron/laudus-financial-masters-daily'),'20 4 */2 * *');
  assert.equal(byPath.get('/api/cron/laudus-stock-daily'),'10 */6 * * *');
  assert.match(coreRoute,/syncLaudusProducts/);
  assert.match(coreRoute,/syncLaudusProcurement/);
  assert.match(coreRoute,/syncLaudusInvoiceTraceEvidence/);
});

test('control-plane freshness follows the reduced call cadence',()=>{
  assert.match(migration,/p\.domain='products'/);
  assert.match(migration,/freshness_sla_minutes=1560/);
  assert.match(migration,/p\.domain='financial_masters'/);
  assert.match(migration,/freshness_sla_minutes=3000/);
  assert.match(migration,/when p_domain='financial_masters' then v_now \+ interval '48 hours'/);
  assert.match(migration,/when p_domain='products' then v_now \+ interval '24 hours'/);
});

test('newer finance and procurement domains remain accepted by sync control',()=>{
  for (const domain of ['bank_statements','accounting_entries','waybills','warehouses','suppliers','procurement']) {
    assert.match(migration,new RegExp(domain));
  }
});


test('consolidated core preserves a monthly API reserve before calling Laudus',()=>{
  assert.match(coreRoute,/CORE_CALL_BUDGET = 30/);
  assert.match(coreRoute,/MONTHLY_RESERVE_FRACTION = 0\.10/);
  assert.match(coreRoute,/laudus_api_budget_service_v1/);
  assert.match(coreRoute,/monthly_remaining_exact/);
  assert.match(coreRoute,/remaining - CORE_CALL_BUDGET >= reserve/);
  assert.match(coreRoute,/status: 'skipped'/);
  assert.match(coreRoute,/reason: budget\.reason/);
});
