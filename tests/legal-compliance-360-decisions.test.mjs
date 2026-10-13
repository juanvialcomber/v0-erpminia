import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const route=readFileSync('app/api/legal/compliance-360/route.ts','utf8');const page=readFileSync('app/dashboard/legal/compliance-360/page.tsx','utf8');
test('permissioned writes are scoped to the active organization',()=>{assert.match(route,/a.level!=='ED'/);assert.match(route,/eq\('organization_id',a.context.organizationId\)/);assert.match(route,/organization_id:a.context.organizationId/);});
test('approval requires a canonical evidence reference and all decisions have audit history',()=>{assert.match(route,/action==='approve_evidence'&&!evidenceRef/);assert.match(route,/actorId:a.context.userId/);assert.match(route,/history:\[\.\.\.history/);});
test('legal can request evidence and set operational deadline',()=>{assert.match(page,/Solicitar antecedentes/);assert.match(page,/Vencimiento operativo/);assert.match(page,/Historial de decisiones/);});

test('export is tenant scoped and explicitly not a legal compliance certificate',()=>{assert.match(route,/searchParams.get\('export'\)/);assert.match(route,/complianceVerdictCalculated:false/);assert.match(route,/decisionHistory:/);assert.match(route,/Content-Disposition/);});
