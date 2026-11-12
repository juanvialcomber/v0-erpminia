
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcilePlantShiftEvidence } from '../lib/production/plant-shift-evidence.mjs';
const row=(date,shift,treated,head,extra={})=>({
  message_id:extra.msg||10,attachment_id:extra.id||'doc1',sha256:extra.sha||'bytes1',
  table_index:0,row_index:extra.row??0,resolved_sample_date:date,date_resolution:'explicit_date',
  approved_for_canonical_import:false,source_cells:[date||'','',shift,'0,98',treated,head,'20','0,3','83','15'],
});
test('two shifts of the same date are not duplicates',()=>{
  const r=reconcilePlantShiftEvidence([row('2026-10-25','A','220,5','1,2',{row:0}),
    row('2026-10-25','B','221,5','1,3',{row:1})]);
  assert.equal(r.summary.reviewCases,2);
  assert.equal(r.summary.duplicateCopies,0);
});
test('same photo forwarded twice preserves provenance but counts as one case',()=>{
  const a=row('2026-10-25','A','220,5','1,2');
  const r=reconcilePlantShiftEvidence([a,{...a,message_id:12,attachment_id:'doc2'}]);
  assert.equal(r.summary.reviewCases,1);
  assert.equal(r.summary.duplicateCopies,1);
  assert.equal(r.items[0].sourceRefs.length,2);
});
test('conflicting values are not promoted or silently selected',()=>{
  const r=reconcilePlantShiftEvidence([row('2026-10-14','A','222,714','1,5'),
    row('2026-10-14','A','223,028','1,5',{id:'doc2',sha:'bytes2'})]);
  assert.equal(r.summary.conflictingSources,1);
  assert.equal(r.items[0].treatedTmsRaw,null);
  assert.equal(r.items[0].approvedForCanonicalImport,false);
});
test('empty sheet rows are review cases not production zeros',()=>{
  const r=reconcilePlantShiftEvidence([row('2026-11-01','A','','')]);
  assert.equal(r.summary.missingMeasurements,1);
  assert.equal(r.items[0].treatedTmsRaw,null);
});
test('an unresolved date cannot inherit one from a different row',()=>{
  const r=reconcilePlantShiftEvidence([row(null,'A','220','1,2')]);
  assert.equal(r.summary.missingIdentity,1);
});
test('canonical date and shift blocks duplicate import',()=>{
  const r=reconcilePlantShiftEvidence([row('2026-10-25','A','220','1,2')],
    [{operation_date:'2026-10-25',shift_code:'A'}]);
  assert.equal(r.summary.alreadyCanonical,1);
});
test('read-only API uses tenant scope and bounds SQL queries',()=>{
  const source=readFileSync(new URL('../app/api/produccion/planta-metalurgia/turnos-por-revisar/route.ts',import.meta.url),'utf8');
  assert.match(source,/requireModuleAccess\(request,MODULE_KEYS\.PROD_OPERACIONES\)/);
  assert.match(source,/\.eq\('organization_id',ctx\.organizationId\)/);
  assert.match(source,/motil_whatsapp_laboratory_received_v1/);
  assert.match(source,/\.limit\(250\)/);
  assert.match(source,/production_plant_shifts/);
  assert.doesNotMatch(source,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|export async function POST/);
});
