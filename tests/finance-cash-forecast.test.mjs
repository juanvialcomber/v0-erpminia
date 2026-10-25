import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const migration = fs.readFileSync('supabase/migrations/20260827192000_add_procurement_cash_forecast_v1.sql','utf8');
const route = fs.readFileSync('app/api/finance/executive/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/finanzas/page.tsx','utf8');

test('cash forecast uses only real payable due dates and keeps undated obligations explicit',()=>{
  assert.match(migration,/due_date is null then 'no_due_date'/i);
  assert.match(migration,/due_date between current_date and current_date \+ 7/i);
  assert.match(migration,/due_date between current_date and current_date \+ 30/i);
  assert.match(migration,/due_date between current_date and current_date \+ 60/i);
  assert.match(migration,/due_date between current_date and current_date \+ 90/i);
  assert.match(migration,/no_due_date_amount/i);
});

test('cash forecast remains separated by currency and excludes settled balances',()=>{
  assert.match(migration,/group by organization_id,currency/i);
  assert.match(migration,/outstanding_amount > 0/i);
  assert.match(migration,/with \(security_invoker=true\)/i);
  assert.match(migration,/grant select on public\.procurement_cash_forecast_summary_v1 to service_role/i);
});

test('finance executive API exposes forecast tenant scoped through organization context',()=>{
  assert.match(route,/procurement_cash_forecast_summary_v1/);
  assert.match(route,/eq\('organization_id', organizationId\)/);
  assert.match(route,/cashForecast: cashForecast\.data \|\| \[\]/);
});

test('finance cockpit keeps short-term treasury visible without expanding the full forecast',()=>{
  assert.match(page,/CxP aprobadas en MOTIL/);
  assert.match(page,/Vence ≤ 7 días/);
  assert.match(page,/Este universo es distinto de la exposición histórica observada en Laudus/);
  assert.doesNotMatch(page,/Próx\. 30 días/);
  assert.doesNotMatch(page,/Próx\. 60 días/);
  assert.doesNotMatch(page,/Próx\. 90 días/);
});
