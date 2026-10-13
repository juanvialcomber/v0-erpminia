import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const page = readFileSync('app/dashboard/sostenibilidad/prevencion-riesgos/carpeta-arranque/page.tsx','utf8');
test('Legal opens on initial review inbox',()=>{
 assert.match(page,/useState\('bandeja'\)/);
 assert.match(page,/status="en_revision_l1"/);
 assert.match(page,/Responsable operativo: Elías/);
});
test('secondary approvals remain in a separate queue',()=>{
 assert.match(page,/status="en_revision_l2"/);
 assert.match(page,/Segunda revisión/);
});
