import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const api=readFileSync('app/api/legal/asistente/history/route.ts','utf8');
const redirectPage=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');

test('legal suggestions require write access and never approve documents',()=>{
 assert.match(api,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC,true\)/);
 assert.match(api,/suggestion_status!=='proposed'/);
 assert.match(api,/doc\.file_path!==record\.file_path/);
 assert.match(api,/document_approval_changed:false/);
 assert.doesNotMatch(api,/\.from\('carpeta_documentos'\)\.update/);
});

test('supervised-review backend remains available without a standalone assistant UI',()=>{
 assert.match(api,/accepted|dismissed/);
 assert.match(api,/document_approval_changed:false/);
 assert.match(redirectPage,/redirect\('\/dashboard\/legal'\)/);
});
