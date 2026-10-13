import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const page=readFileSync('app/dashboard/legal/compliance-360/page.tsx','utf8');
const home=readFileSync('app/dashboard/legal/page.tsx','utf8');
test('Compliance 360 uses permissioned regulatory API with no invented verdict',()=>{assert.match(page,/\/api\/legal\/sernageomin/);assert.match(page,/No constituye certificación de cumplimiento/);assert.match(page,/Aplicabilidad por revisar/);});
test('Legal workspace links to Compliance 360',()=>{assert.match(home,/href="\/dashboard\/legal\/compliance-360"/);});
test('Evidence candidates stay distinct from compliance',()=>{assert.match(page,/Ninguna coincidencia documental acredita cumplimiento/);assert.match(page,/Gestionar expediente/);});
