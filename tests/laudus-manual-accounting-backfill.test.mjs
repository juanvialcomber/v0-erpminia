import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/cron/laudus-accounting-backfill/route.ts','utf8');

test('manual accounting backfill is authenticated and role scoped',()=>{
  assert.match(route,/request\.nextUrl\.searchParams\.get\('manual'\) === '1'/);
  assert.match(route,/getOrganizationContext\(request\)/);
  assert.match(route,/superadmin/);
  assert.match(route,/admin/);
  assert.match(route,/operaciones-supervisor/);
  assert.match(route,/jefe_mantencion/);
  assert.match(route,/No autorizado para ejecutar el backfill Laudus/);
});

test('manual accounting backfill preserves budget and reserve gate',()=>{
  assert.match(route,/monthly_remaining_exact/);
  assert.match(route,/remaining - MAX_CALLS_PER_RUN < MINIMUM_RESERVE/);
  assert.match(route,/MINIMUM_RESERVE = 200/);
  assert.match(route,/MAX_CALLS_PER_RUN = 30/);
});

test('manual accounting backfill is asynchronous and bounded',()=>{
  assert.match(route,/after\(async \(\) =>/);
  assert.match(route,/runLaudusAccountingBackfill\(organizationId, manualDb, MAX_CALLS_PER_RUN\)/);
  assert.match(route,/status: 'accepted'/);
  assert.match(route,/\{ status: 202 \}/);
});

test('scheduled accounting backfill keeps CRON_SECRET behavior intact',()=>{
  assert.match(route,/cronAuthorized/);
  assert.match(route,/authorization/);
  assert.match(route,/laudus_source_status_service_v1/);
});
