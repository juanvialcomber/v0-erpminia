import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const s=readFileSync('components/subcontratistas/subcontractor-portal.tsx','utf8');
test('the document workflow remains available in minimal portal',()=>{
 assert.match(s,/Documentos requeridos/);
 assert.match(s,/Enviar a revisión/);
 assert.match(s,/onClick=\{submitCarpeta\}/);
 assert.match(s,/PortalDocRow/);
 assert.match(s,/uploadFile\(file\)/);
 assert.match(s,/handleLogout/);
});
test('document progress does not divide by zero',()=>{
 assert.match(s,/session\.total_documents > 0/);
});

test('uploads are disabled while Legal reviews the folder',()=>{
 assert.match(s,/session\.can_upload && !!session\.carpeta/);
 assert.match(s,/!canReplace \|\| uploading/);
 assert.match(s,/canUpload && \(!isCorrection \|\| observed\)/);
 assert.match(s,/\['aprobado', 'en_revision_l1', 'en_revision_l2'\]/);
});
test('pending documents appear before uploaded documents',()=>{
 assert.match(s,/Number\(Boolean\(a\.file_name\)\) - Number\(Boolean\(b\.file_name\)\)/);
});
