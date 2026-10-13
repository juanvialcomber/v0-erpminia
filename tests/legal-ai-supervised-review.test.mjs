import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const api=readFileSync('app/api/legal/asistente/history/route.ts','utf8');
const ui=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
test('legal suggestions require write access and never approve documents',()=>{
 assert.match(api,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC,true\)/);
 assert.match(api,/suggestion_status!=='proposed'/);
 assert.match(api,/doc\.file_path!==record\.file_path/);
 assert.match(api,/document_approval_changed:false/);
 assert.doesNotMatch(api,/\.from\('carpeta_documentos'\)\.update/);
});
test('Legal UI presents explicit supervised actions',()=>{
 assert.match(ui,/Guardar observación/);
 assert.match(ui,/Descartar propuesta/);
 assert.match(ui,/No modifica la aprobación documental/);
});
