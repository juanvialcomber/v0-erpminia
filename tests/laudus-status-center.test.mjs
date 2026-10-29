import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/integrations/laudus/status/route.ts','utf8');
const page = fs.readFileSync('app/dashboard/integraciones/laudus/page.tsx','utf8');
const strip = fs.readFileSync('components/data/data-source-status-strip.tsx','utf8');

test('Laudus status center uses service views and user-facing states',()=>{
  assert.match(route,/laudus_source_status_service_v1/);
  assert.match(route,/laudus_sync_health_service_v1/);
  assert.match(route,/laudus_inventory_readiness_service_v1/);
  assert.doesNotMatch(route,/\.schema\('integration'\)/);
  assert.match(route,/actualizadas automáticamente/);
});

test('Laudus status page exposes one executive status surface',()=>{
  assert.match(page,/Estado general/);
  assert.match(page,/Áreas conectadas/);
  assert.match(page,/Actualizadas/);
  assert.match(page,/Disponibles sin ciclo automático/);
  assert.match(page,/Requieren atención/);
  assert.doesNotMatch(page,/endpoint|payload|schema|cron|deployment/i);
});

test('data source strip links Laudus to the status center',()=>{
  assert.match(strip,/\/dashboard\/integraciones\/laudus/);
  assert.match(strip,/Ver estado Laudus/);
});
