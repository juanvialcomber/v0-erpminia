import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('temporary cross-mine access remains organization scoped and requires maintenance write permission', async () => {
 const access = await readFile(new URL('../lib/maintenance/meter-asset-access.ts', import.meta.url), 'utf8');
 const capture = await readFile(new URL('../app/api/maintenance/runtime-readings/capture/route.ts', import.meta.url), 'utf8');
 const vision = await readFile(new URL('../app/api/maintenance/runtime-readings/analyze-photo/route.ts', import.meta.url), 'utf8');
 const list = await readFile(new URL('../app/api/maintenance/runtime-readings/route.ts', import.meta.url), 'utf8');
 assert.match(access, /TEMPORARY OPERATING POLICY/);
 assert.match(access, /return null;/);
 for (const endpoint of [capture,vision]) {
   assert.match(endpoint, /requireModuleAccess\(request, MODULE_KEYS\.MANT_OPERACIONES, true\)/);
   assert.match(endpoint, /requireMeterAssetAssignment/);
   assert.match(endpoint, /eq\('organization_id', context\.organizationId\)/);
 }
 assert.match(list, /assets: assetsResult\.data \|\| \[\]/);
 assert.match(list, /eq\('organization_id', context\.organizationId\)/);
});
