import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/cron/laudus-financial-masters-daily/route.ts', 'utf8');

test('manual Laudus financial master sync is authenticated tenant scoped and async', () => {
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /jefe_mantencion/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /syncLaudusFinancialMasters\(organizationId, manualDb\)/);
  assert.match(route, /status: 'accepted'/);
  assert.match(route, /\{ status: 202 \}/);
});

test('scheduled CRON_SECRET path remains intact', () => {
  assert.match(route, /cronAuthorized/);
  assert.match(route, /laudus_source_status_service_v1/);
  assert.match(route, /syncLaudusFinancialMasters/);
});
