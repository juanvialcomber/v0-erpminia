import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/cron/laudus-recovery/route.ts','utf8');
const vercel = JSON.parse(fs.readFileSync('vercel.json','utf8'));

test('Laudus recovery only targets unhealthy accounting and supplier domains',()=>{
  assert.match(route,/RECOVERABLE_DOMAINS = new Set\(\['accounting_entries', 'suppliers'\]\)/);
  assert.match(route,/\.in\('health_status', \['broken', 'degraded'\]\)/);
  assert.match(route,/\.gt\('consecutive_failures', 0\)/);
  assert.doesNotMatch(route,/syncLaudusProcurement/);
  assert.doesNotMatch(route,/syncLaudusPurchaseWaybills/);
});

test('Laudus recovery preserves cooldown and monthly reserve',()=>{
  assert.match(route,/COOLDOWN_MINUTES = 30/);
  assert.match(route,/RECOVERY_CALL_BUDGET = 30/);
  assert.match(route,/MINIMUM_MONTHLY_RESERVE = 200/);
  assert.match(route,/monthly_remaining_exact/);
  assert.match(route,/remaining - RECOVERY_CALL_BUDGET < MINIMUM_MONTHLY_RESERVE/);
});

test('Laudus recovery remains protected by CRON_SECRET',()=>{
  assert.match(route,/CRON_SECRET/);
  assert.match(route,/authorization/);
  assert.match(route,/Bearer/);
  assert.match(route,/No autorizado/);
});

test('Laudus recovery uses tracked domain operations and isolates failures',()=>{
  assert.match(route,/withLaudusApiUsageTracking/);
  assert.match(route,/syncLaudusAccountingEntries/);
  assert.match(route,/syncLaudusSuppliers/);
  assert.match(route,/status: 'failed'/);
});

test('Laudus recovery is staggered away from stock and backfill crons',()=>{
  const recovery=vercel.crons.find((cron)=>cron.path==='/api/cron/laudus-recovery');
  assert.ok(recovery);
  assert.equal(recovery.schedule,'50 */6 * * *');
  const stock=vercel.crons.find((cron)=>cron.path==='/api/cron/laudus-stock-daily');
  const backfill=vercel.crons.find((cron)=>cron.path==='/api/cron/laudus-accounting-backfill');
  assert.notEqual(recovery.schedule,stock?.schedule);
  assert.notEqual(recovery.schedule,backfill?.schedule);
});
