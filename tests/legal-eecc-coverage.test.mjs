import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const api=readFileSync('app/api/legal/eecc-coverage/route.ts','utf8');
const home=readFileSync('app/dashboard/legal/page.tsx','utf8');
test('EECC coverage requires Legal access and tenant-scoped registration',()=>{
 assert.match(api,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(api,/eq\('organization_id',access\.organizationId\)/);
 assert.match(api,/eq\('is_active',true\)/);
});
test('EECC coverage keeps unstarted folders apart from Legal approvals',()=>{
 assert.match(api,/without_folder:entries\.filter/);
 assert.match(home,/contratistas registradas/);
 assert.match(home,/aún sin carpeta/);
 assert.match(home,/c\.status === 'en_revision_l1'/);
});
