import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const helper = fs.readFileSync('lib/integrations/laudus/data-quality.ts','utf8');
const procurement = fs.readFileSync('lib/integrations/laudus/procurement-sync.ts','utf8');
const waybills = fs.readFileSync('lib/integrations/laudus/journal-waybill-sync.ts','utf8');
const health = fs.readFileSync('app/api/data-quality/health/route.ts','utf8');
const migration = fs.readFileSync('supabase/migrations/20261103135000_laudus_data_quality_reconciler.sql','utf8');
const summary = fs.readFileSync('supabase/migrations/20261103132200_laudus_data_quality_summary_v2.sql','utf8');

test('future issued-date detector keeps Laudus source truth and classifies severity',()=>{
  assert.match(helper,/24 \* 60 \* 60 \* 1000/);
  assert.match(helper,/90 \* 24 \* 60 \* 60 \* 1000/);
  assert.match(helper,/future_issued_date:/);
  assert.match(helper,/severity: issued > extremeThreshold \? 'error' : 'warning'/);
  assert.doesNotMatch(helper,/row\.issuedDate\s*=/);
});

test('procurement and waybill syncs reconcile source-date incidents automatically',()=>{
  assert.match(procurement,/futureIssuedDateIncidents\(orderRows, 'purchase_order'\)/);
  assert.match(procurement,/reconcileFutureIssuedDateIncidents[\s\S]*'procurement'/);
  assert.match(waybills,/futureIssuedDateIncidents\(listed\.rows, 'waybill'\)/);
  assert.match(waybills,/reconcileFutureIssuedDateIncidents[\s\S]*'waybills'/);
  assert.match(procurement,/futureIssuedDateIncidents:/);
  assert.match(waybills,/futureIssuedDateIncidents:/);
});

test('reconciler is idempotent, service-only and resolves absent incidents',()=>{
  assert.match(migration,/category='data_quality'/);
  assert.match(migration,/occurrence_count=occurrence_count\+1/);
  assert.match(migration,/status='resolved'/);
  assert.match(migration,/details->>'quality_rule'=p_rule/);
  assert.match(migration,/canonical_mutated',false/);
  assert.match(migration,/revoke all on function public\.motil_reconcile_laudus_data_quality_incidents\(uuid,text,text,jsonb\)[\s\S]*authenticated/);
  assert.match(migration,/grant execute on function public\.motil_reconcile_laudus_data_quality_incidents\(uuid,text,text,jsonb\)[\s\S]*service_role/);
});

test('Data Health makes open Laudus source incidents visible in Compras',()=>{
  assert.match(health,/motil_get_laudus_data_quality_incident_summary_v2/);
  assert.match(health,/laudusSourceIncidents/);
  assert.match(health,/Incidentes Laudus fuente/);
  assert.match(health,/Errores Laudus/);
  assert.match(health,/Advertencias Laudus/);
  assert.match(health,/Revisar los incidentes de fuente Laudus antes de usar fechas en KPIs o timelines/);
});

test('Data Health summary is authenticated and tenant checked',()=>{
  assert.match(summary,/auth\.uid\(\)/);
  assert.match(summary,/organization_access_denied/);
  assert.match(summary,/p\.organization_id=p_organization_id/);
  assert.match(summary,/i\.category='data_quality'/);
});
