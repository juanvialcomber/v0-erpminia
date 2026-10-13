import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
const api=readFileSync('app/api/legal/asistente/analyze-document/route.ts','utf8');
const download=readFileSync('app/api/carpeta-arranque/[id]/download/route.ts','utf8');
const ui=readFileSync('app/dashboard/legal/asistente/page.tsx','utf8');
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
test('document analysis requires explicit user interaction',()=>{
 assert.match(ui,/onClick=\{\(\)=>void analyze/);
 assert.match(ui,/No constituye aprobación/);
});
