import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

// Tenant-boundary contract checks; offline, no credentials or production API requests.
const read = p => readFileSync(new URL(p, import.meta.url),'utf8');
const context = read('../lib/api/organization-context.ts');
const server = read('../lib/supabase-server.ts');
const operational = read('../app/api/maintenance/assets/[id]/operational-360/route.ts');
const economics = read('../app/api/maintenance/assets/[id]/economic-operational-history/route.ts');

test('request context passes application user to database client', () => {
  assert.match(context,/getSupabaseServerClient\(auth\.user\.id\)/);
  assert.match(server,/'x-application-user-id': applicationUserId/);
});
test('Asset360 routes require organization and maintenance grants before reads', () => {
  for (const route of [operational,economics]) {
    assert.match(route,/requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES\)/);
    assert.match(route,/if \(!access\.authorized\) return access\.response/);
    assert.match(route,/if \(!context\.ok\) return context\.response/);
    assert.match(route,/\.eq\('organization_id', context\.organizationId\)/);
  }
});
test('economic ledger read filters organization AND canonical asset',()=>{
  assert.match(economics,/\.eq\('organization_id', organizationId\)/);
  assert.match(economics,/\.eq\('canonical_asset_id', assetId\)/);
});
