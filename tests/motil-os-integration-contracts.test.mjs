import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Static contract tests only. No network, credentials, database writes or live OT.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const operational = read('../app/api/maintenance/assets/[id]/operational-360/route.ts');
const economic = read('../app/api/maintenance/assets/[id]/economic-operational-history/route.ts');
const calendar = read('../app/api/calendar/operational/route.ts');
const tower = read('../app/api/maintenance/control-tower/route.ts');
const equipment = read('../app/api/maintenance/equipment/route.ts');

for (const [name, source] of [['operational-360', operational], ['economic-operational-history', economic]]) {
  test(`${name} requires maintenance permission and tenant context`, () => {
    assert.match(source, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
    assert.match(source, /if \(!access\.authorized\) return access\.response/);
    assert.match(source, /getOrganizationContext\(request\)/);
    assert.match(source, /if \(!context\.ok\) return context\.response/);
    assert.match(source, /\.eq\('organization_id', context\.organizationId\)/);
    assert.match(source, /export async function GET/);
  });
}

test('operational 360 links canonical assets with OT and procurement evidence', () => {
  for (const table of ['maintenance_canonical_assets_v1', 'maintenance_work_orders', 'canonical_purchase_order_lines_current']) {
    assert.ok(operational.includes(`.from('${table}')`), `Missing source ${table}`);
  }
});

test('economic history reads asset-scoped ledger, reliability and production', () => {
  for (const table of ['canonical_clp_cost_ledger', 'maintenance_operational_work_order_flow_v1', 'asset_runtime_summary_v1', 'production_drilling_source_reports']) {
    assert.ok(economic.includes(`.from('${table}')`), `Missing source ${table}`);
  }
  assert.match(economic, /\.eq\('canonical_asset_id', id\)/);
});

test('calendar and tower retain independent canonical OT reads', () => {
  assert.match(calendar, /\.from\('maintenance_work_orders'\)/);
  assert.match(calendar, /\.not\('scheduled_date', 'is', null\)/);
  assert.match(calendar, /includeForScope\(row\.status, scope\)/);
  assert.match(tower, /\.from\('maintenance_work_orders'\)/);
  assert.match(tower, /\['completed', 'closed', 'cancelled', 'canceled'\]/);
});

test('equipment list uses canonical entity and tenant isolation', () => {
  assert.match(equipment, /\.from\('canonical_assets_current'\)/);
  assert.match(equipment, /requireModuleAccess\(request,/);
});

// These contracts DO NOT substitute runtime authorization, RLS, or behavior tests.
