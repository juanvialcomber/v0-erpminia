import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const route = fs.readFileSync('app/api/cron/laudus-stock-daily/route.ts', 'utf8');

test('manual Laudus stock sync stays authenticated and organization scoped', () => {
  assert.match(route, /manualRequested/);
  assert.match(route, /getOrganizationContext\(request\)/);
  assert.match(route, /jefe_mantencion/);
  assert.match(route, /organizationIds = \[context\.organizationId\]/);
  assert.match(route, /No autorizado para sincronizar Laudus/);
});

test('cron secret path remains available for scheduled stock sync', () => {
  assert.match(route, /cronAuthorized/);
  assert.match(route, /laudus_source_status_service_v1/);
  assert.match(route, /syncLaudusStockDaily/);
});


test('manual sync responds immediately and continues after response', () => {
  assert.match(route, /import \{ after, NextRequest, NextResponse \} from 'next\/server'/);
  assert.match(route, /after\(async \(\) =>/);
  assert.match(route, /status: 'accepted'/);
  assert.match(route, /\{ status: 202 \}/);
  assert.match(route, /manual sync completed/);
});
