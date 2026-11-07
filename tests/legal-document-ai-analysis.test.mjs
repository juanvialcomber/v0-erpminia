import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const api=readFileSync('app/api/legal/asistente/analyze-document/route.ts','utf8');
const download=readFileSync('app/api/carpeta-arranque/[id]/download/route.ts','utf8');
const redirectPage=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
const widget=readFileSync('components/intelligence/senior-assistant-widget.tsx','utf8');

test('PDF analysis is tenant-scoped and never approves the document',()=>{
 assert.match(api,/requireModuleAccess\(request, MODULE_KEYS\.LEGAL_EECC\)/);
 assert.match(api,/organization_id',access\.organizationId/);
 assert.match(api,/Documento fuera de la organización/);
 assert.match(api,/decision:'pendiente_revision_humana'/);
 assert.match(api,/file_data/);
});

test('download requires RBAC and company scope before signed URL',()=>{
 assert.match(download,/MODULE_KEYS\.LEGAL_EECC/);
 assert.match(download,/MODULE_KEYS\.HSE_DOCUMENTACION/);
 assert.match(download,/Carpeta fuera de la organización/);
});

test('document AI does not run automatically from the Legal floating chat',()=>{
 assert.match(redirectPage,/redirect\('\/dashboard\/legal'\)/);
 assert.match(widget,/endpoint: '\/api\/legal\/asistente'/);
 assert.doesNotMatch(widget,/analyze-document/);
});
