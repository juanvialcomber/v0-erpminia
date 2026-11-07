import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const route=readFileSync('app/api/legal/asistente/test-document/route.ts','utf8');
const redirectPage=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
const widget=readFileSync('components/intelligence/senior-assistant-widget.tsx','utf8');

test('isolated legal PDF analysis is authorized and does not write contractor records',()=>{
 assert.match(route,/requireModuleAccess\(request,MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(route,/file\.size>8\*1024\*1024/);
 assert.match(route,/persisted:false/);
 assert.doesNotMatch(route,/\.from\('carpeta_documentos'\)|\.upload\(/);
 assert.match(route,/pendiente_revision_humana/);
});

test('isolated PDF testing is not exposed as a standalone Legal assistant screen',()=>{
 assert.match(redirectPage,/redirect\('\/dashboard\/legal'\)/);
 assert.match(widget,/endpoint: '\/api\/legal\/asistente'/);
 assert.doesNotMatch(widget,/test-document/);
});
