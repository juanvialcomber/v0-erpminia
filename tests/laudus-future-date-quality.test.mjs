import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const quality = fs.readFileSync('lib/integrations/laudus/data-quality.ts','utf8');
const procurement = fs.readFileSync('lib/integrations/laudus/procurement-sync.ts','utf8');
const journalWaybill = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const health = fs.readFileSync('app/api/data-quality/health/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103133500_laudus_future_date_incidents.sql','utf8');
const summaryV2 = fs.readFileSync('supabase/migrations/20261103132200_laudus_data_quality_summary_v2.sql','utf8');

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

test('Data Health summary RPC is authenticated and tenant scoped',()=>{
  assert.match(migration,/motil_get_laudus_data_quality_incident_summary/);
  assert.match(migration,/auth\.uid\(\)/);
  assert.match(migration,/auth_profile_identity_links/);
  assert.match(migration,/p\.organization_id=p_organization_id/);
  assert.match(migration,/to authenticated, service_role/);
});

test('Data Health surfaces Laudus source incidents for procurement',()=>{
  assert.match(health,/motil_get_laudus_data_quality_incident_summary/);
  assert.match(health,/Incidentes Laudus fuente/);
  assert.match(health,/laudusSourceIncidents/);
  assert.match(health,/antes de usar fechas en KPIs o timelines/);
});


test('Data Health severity summary v2 keeps tenant checks and exposes error versus warning counts',()=>{
  assert.match(summaryV2,/motil_get_laudus_data_quality_incident_summary_v2/);
  assert.match(summaryV2,/auth\.uid\(\)/);
  assert.match(summaryV2,/auth_profile_identity_links/);
  assert.match(summaryV2,/error_incidents bigint/);
  assert.match(summaryV2,/warning_incidents bigint/);
  assert.match(summaryV2,/to authenticated, service_role/);
});

test('Data Health treats Laudus error incidents as critical and keeps warnings visible',()=>{
  assert.match(health,/motil_get_laudus_data_quality_incident_summary_v2/);
  assert.match(health,/laudusErrorIncidents/);
  assert.match(health,/laudusWarningIncidents/);
  assert.match(health,/laudusCriticalIncidents > 0 \|\| laudusErrorIncidents > 0/);
  assert.match(health,/Errores Laudus/);
  assert.match(health,/Advertencias Laudus/);
});
