import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const route=readFileSync('app/api/legal/asistente/test-document/route.ts','utf8');
const ui=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
test('isolated legal PDF analysis is authorized and does not write contractor records',()=>{
 assert.match(route,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(route,/file\.size>8\*1024\*1024/);
 assert.match(route,/persisted:false/);
 assert.doesNotMatch(route,/\.from\('carpeta_documentos'\)|\.upload\(/);
 assert.match(route,/pendiente_revision_humana/);
});
test('Legal offers an explicit PDF test upload',()=>{
 assert.match(ui,/type="file"/);
 assert.match(ui,/test-document/);
 assert.match(ui,/Prueba de PDF aislada/);
});
