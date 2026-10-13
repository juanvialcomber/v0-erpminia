import test from 'node:test';import assert from 'node:assert/strict';import{readFileSync}from'node:fs';
const sql=readFileSync('supabase/migrations/20261012231000_eecc_document_versions.sql','utf8');
const upload=readFileSync('app/api/portal/subcontratistas/carpeta/[id]/upload-doc/route.ts','utf8');
test('prior reviewed file is archived before replacement',()=>{assert.match(sql,/before update of file_path/);assert.match(sql,/old\.file_path is distinct from new\.file_path/);assert.match(sql,/old\.l1_status,old\.l1_observaciones/);assert.match(sql,/old\.l2_status,old\.l2_observaciones/);});
test('history inaccessible to direct clients and old file kept',()=>{assert.match(sql,/enable row level security/);assert.doesNotMatch(sql,/create policy/i);assert.doesNotMatch(upload,/remove\(\[existingSlot\.file_path\]\)/);});
