import fs from 'node:fs';
import assert from 'node:assert/strict';
import test from 'node:test';

const accounting = fs.readFileSync('app/api/cron/laudus-accounting-entries-daily/route.ts', 'utf8');
const suppliers = fs.readFileSync('app/api/cron/laudus-suppliers-weekly/route.ts', 'utf8');

for (const [name, route] of [['accounting', accounting], ['suppliers', suppliers]]) {
  test(`manual Laudus ${name} sync is authenticated, tenant-scoped and async`, () => {
    assert.match(route, /request\.nextUrl\.searchParams\.get\('manual'\) === '1'/);
    assert.match(route, /getOrganizationContext\(request\)/);
    assert.match(route, /superadmin/);
    assert.match(route, /admin/);
    assert.match(route, /operaciones-supervisor/);
    assert.match(route, /jefe_mantencion/);
    assert.match(route, /after\(async \(\) =>/);
    assert.match(route, /status: 'accepted'/);
    assert.match(route, /\{ status: 202 \}/);
  });

  test(`scheduled Laudus ${name} sync keeps CRON_SECRET authorization`, () => {
    assert.match(route, /cronAuthorized/);
    assert.match(route, /authorization/);
    assert.match(route, /laudus_source_status_service_v1/);
  });
}

test('manual accounting sync stays on the accounting domain only', () => {
  assert.match(accounting, /syncLaudusAccountingEntries/);
  assert.doesNotMatch(accounting, /syncLaudusProducts/);
  assert.doesNotMatch(accounting, /syncLaudusProcurement/);
});

test('manual supplier sync stays on the supplier domain only', () => {
  assert.match(suppliers, /syncLaudusSuppliers/);
  assert.doesNotMatch(suppliers, /syncLaudusProcurement/);
});
