import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const quality = fs.readFileSync('lib/integrations/laudus/data-quality.ts','utf8');
const procurement = fs.readFileSync('lib/integrations/laudus/procurement-sync.ts','utf8');
const journalWaybill = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const health = fs.readFileSync('app/api/data-quality/health/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103133500_laudus_future_date_incidents.sql','utf8');

test('future issued-date detector preserves source truth and tolerates timezone drift',()=>{
  assert.match(quality,/24 \* 60 \* 60 \* 1000/);
  assert.match(quality,/90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(quality,/future_issued_date:/);
  assert.match(quality,/issued_date: issued\.toISOString\(\)/);
  assert.match(quality,/severity: issued > extremeThreshold \? 'error' : 'warning'/);
});

test('procurement and waybill syncs reconcile source-date incidents',()=>{
  assert.match(procurement,/futureIssuedDateIncidents\(orderRows, 'purchase_order'\)/);
  assert.match(procurement,/reconcileFutureIssuedDateIncidents/);
  assert.match(journalWaybill,/futureIssuedDateIncidents\(listed\.rows, 'waybill'\)/);
  assert.match(journalWaybill,/reconcileFutureIssuedDateIncidents/);
});

test('accounting sync is not contaminated by waybill future-date metadata',()=>{
  const accountingBlock=journalWaybill.slice(
    journalWaybill.indexOf('export async function syncLaudusAccountingEntries'),
    journalWaybill.indexOf('export async function syncLaudusPurchaseWaybills')
  );
  assert.doesNotMatch(accountingBlock,/futureIssuedDateIncidents/);
  assert.doesNotMatch(accountingBlock,/futureIssuedDateQuality/);
});

test('incident reconciliation preserves source evidence and resolves disappeared anomalies',()=>{
  assert.match(migration,/category='data_quality'/);
  assert.match(migration,/quality_rule/);
  assert.match(migration,/source_truth','laudus'/);
  assert.match(migration,/canonical_mutated',false/);
  assert.match(migration,/status='resolved'/);
  assert.match(migration,/not \(fingerprint = any\(v_seen\)\)/);
});

test('incident reconciliation RPC is service-role only',()=>{
  assert.match(migration,/revoke all on function public\.motil_reconcile_laudus_data_quality_incidents/);
  assert.match(migration,/from public, anon, authenticated/);
  assert.match(migration,/to service_role/);
});

test('Data Health surfaces Laudus source incidents for procurement',()=>{
  assert.match(health,/laudus_sync_health_service_v1/);
  assert.match(health,/Incidentes Laudus fuente/);
  assert.match(health,/laudusSourceIncidents/);
  assert.match(health,/antes de usar fechas en KPIs o timelines/);
});
