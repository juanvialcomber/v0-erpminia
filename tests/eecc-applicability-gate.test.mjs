import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const review=readFileSync('app/api/carpeta-arranque/[id]/review/route.ts','utf8');
const api=readFileSync('app/api/carpeta-arranque/[id]/applicability/route.ts','utf8');
const sql=readFileSync('supabase/migrations/20261012225000_eecc_document_applicability.sql','utf8');
test('Legal edit access mandatory for applicability decisions',()=>{assert.match(api,/requireModuleAccess\(request, MODULE_KEYS\.LEGAL_EECC,true\)/)});
test('L1 review blocked when normative applicability pending or evidence missing',()=>{assert.match(review,/Legal debe resolver aplicabilidad antes de aprobar/);assert.match(review,/Faltan documentos aplicables/)});
test('Every applicability decision has accountable reviewer and evidence basis',()=>{assert.match(sql,/decided_by uuid/);assert.match(sql,/legal_basis text/);assert.match(sql,/enable row level security/)});

test('observed documents may be returned before applicability is fully decided',()=>{ assert.match(review,/level === 1 && carpeta.status === 'en_revision_l1' && allL1Done && !anyL1NoCumple/); });
