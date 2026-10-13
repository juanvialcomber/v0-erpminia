import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const upload=readFileSync('app/api/portal/subcontratistas/carpeta/[id]/upload-doc/route.ts','utf8');
const submit=readFileSync('app/api/portal/subcontratistas/carpeta/[id]/submit/route.ts','utf8');
const ui=readFileSync('components/subcontratistas/subcontractor-portal.tsx','utf8');
test('only observed documents can be corrected in rejected folder',()=>{
 assert.match(upload,/Solo puedes corregir documentos observados/);
 assert.doesNotMatch(upload,/storage\.from\(BUCKET\)\.remove\(\[existingSlot\.file_path\]\)/);
});
test('correction re-submits to L1 Legal review and notifies Elias',()=>{
 assert.match(submit,/\['pendiente', 'rechazado'\]/);
 assert.match(submit,/Corrige todos los documentos observados/);
 assert.match(submit,/eliasfernandez@lapatagua\.cl/);
 assert.match(submit,/status: 'en_revision_l1'/);
});
test('contractor sees objections and can resend',()=>{
 assert.match(ui,/doc\.l1_observaciones \|\| doc\.l2_observaciones/);
 assert.match(ui,/isCorrection=\{session\.carpeta\?\.status === 'rechazado'\}/);
});
