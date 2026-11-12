import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { reconcilePlantShiftEvidence } from '../lib/production/plant-shift-evidence.mjs';
const row=(day,shift,tms,grade,extra={})=>({
  message_id:extra.msg??10,attachment_id:extra.id??'doc1',sha256:extra.sha??'bytes1',
  table_index:0,row_index:extra.row??0,
  resolved_sample_date:day,date_resolution:'explicit_date',
  approved_for_canonical_import:false,
  source_cells:[day||'','',shift,'0,98',tms,grade,'20','0,3','83','15'],
});
test('separate A and B turns do not collapse to one case',()=>{
  const r=reconcilePlantShiftEvidence([
    row('2026-10-25','A','220,5','1,2',{row:0}),
    row('2026-10-25','B','221,5','1,3',{row:1}),
  ]);
  assert.equal(r.summary.reviewCases,2);assert.equal(r.summary.duplicateCopies,0);
});
test('same physical photo forwarded twice counts once and preserves both links',()=>{
  const first=row('2026-10-25','A','220,5','1,2');
  const r=reconcilePlantShiftEvidence([first,{...first,message_id:12,attachment_id:'doc2'}]);
  assert.equal(r.summary.reviewCases,1);assert.equal(r.summary.duplicateCopies,1);
  assert.equal(r.items[0].sourceRefs.length,2);
});
test('two independent photos with same values are corroborations, not duplicates',()=>{
  const r=reconcilePlantShiftEvidence([row('2026-10-25','A','220,5','1,2'),
    row('2026-10-25','A','220,5','1,2',{sha:'other',id:'doc2'})]);
  assert.equal(r.summary.reviewCases,1);assert.equal(r.summary.duplicateCopies,0);
  assert.equal(r.items[0].independentSources,2);
});
test('different nonblank values for the same day shift remain conflicts',()=>{
  const r=reconcilePlantShiftEvidence([
    row('2026-10-14','A','222,714','1,38'),
    row('2026-10-14','A','223,028','1,47',{id:'doc2',sha:'other'}),
  ]);
  assert.equal(r.summary.conflictingSources,1);
  assert.equal(r.items[0].treatedTmsRaw,null);
  assert.equal(r.items[0].headGradeRaw,null);
  assert.deepEqual(r.items[0].conflictingFields.filter(x=>x==='treatedTms'||x==='headGrade'),
    ['treatedTms','headGrade']);
  assert.equal(r.items[0].approvedForCanonicalImport,false);
});
test('blank partial measurement is not a contradictory zero',()=>{
  const r=reconcilePlantShiftEvidence([
    row('2026-10-25','A','',''),
    row('2026-10-25','A','220,5','1,2',{id:'doc2',sha:'other'}),
  ]);
  assert.equal(r.summary.conflictingSources,0);
  assert.equal(r.items[0].treatedTmsRaw,'220,5');
});
test('empty future template does not shift last evidence date or create fake production',()=>{
  const r=reconcilePlantShiftEvidence([
    row('2026-10-25','A','220,5','1,2'),
    row('2026-11-01','A','','',{row:2}),
  ]);
  assert.equal(r.summary.latestTemplateDate,'2026-11-01');
  assert.equal(r.summary.latestMeasuredDate,'2026-10-25');
  assert.equal(r.summary.latestCompleteCandidateDate,'2026-10-25');
  assert.equal(r.summary.missingMeasurements,1);
});
test('unidentified rows stay separate and never inherit another date',()=>{
  const r=reconcilePlantShiftEvidence([row(null,'A','220,5','1,2'),
    row('2026-10-25','','220,5','1,2',{row:2})]);
  assert.equal(r.summary.missingIdentity,2);
});
test('a previously registered canonical date+shift is never a new candidate',()=>{
  const r=reconcilePlantShiftEvidence([
    row('2026-10-25','A','220,5','1,2'),
  ],[{operation_date:'2026-10-25',shift_code:'A'}]);
  assert.equal(r.summary.alreadyCanonical,1);
  assert.equal(r.items[0].status,'already_canonical');
});
test('source-relative magnitude anomalies are warnings, not automatic corrections',()=>{
  const rows=Array.from({length:12},(_,i)=>
    row('2026-10-'+String(i+1).padStart(2,'0'),'A','22'+String(i%5)+',1','1,3',
      {id:'doc'+i,sha:'hash'+i}));
  rows.push(row('2026-10-15','A','2216,154','1,59',{id:'outlier',sha:'outlier'}));
  const r=reconcilePlantShiftEvidence(rows);
  assert.equal(r.summary.magnitudeAnomalies,1);
  const high=r.items.find(x=>x.operationDate==='2026-10-15');
  assert.equal(high.magnitudeAnomaly,true);
  assert.equal(high.approvedForCanonicalImport,false);
});
test('endpoint remains tenant-scoped and read-only; UI offers existing protected images',()=>{
  const api=readFileSync(new URL('../app/api/produccion/planta-metalurgia/turnos-por-revisar/route.ts',import.meta.url),'utf8');
  const ui=readFileSync(new URL('../components/production/plant-shift-evidence-reconciliation.tsx',import.meta.url),'utf8');
  assert.match(api,/requireModuleAccess\(request,MODULE_KEYS\.PROD_OPERACIONES\)/);
  assert.match(api,/\.eq\('organization_id',ctx\.organizationId\)/);
  assert.match(api,/\.limit\(250\)/);
  assert.doesNotMatch(api,/\.insert\(|\.upsert\(|\.update\(|\.delete\(|export async function POST/);
  assert.match(ui,/whatsapp-evidence/);
  assert.match(ui,/mode=overview/);
  assert.match(ui,/noopener noreferrer/);
});
