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

test('EECC coverage is explicitly scoped to the current compliance month',()=>{
 assert.match(api,/currentPeriod/);
 assert.match(api,/eq\('compliance_period',period\)/);
 assert.match(api,/without_folder:entries\.filter/);
 assert.match(api,/in_review:/);
 assert.match(home,/coverage\.summary\.in_review/);
});


const supplierPage=readFileSync('app/dashboard/legal/contratistas-documentos/page.tsx','utf8');

test('Elias supplier workspace leads with current-month coverage',()=>{
 assert.match(supplierPage,/Cumplimiento mensual/);
 assert.match(supplierPage,/mes en curso/);
 assert.match(supplierPage,/\/api\/legal\/eecc-coverage/);
 assert.match(supplierPage,/Falta carpeta del mes/);
 assert.match(supplierPage,/Ver carpetas y documentos/);
});
