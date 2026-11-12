// Read-only evidence reconciliation. OCR rows are never canonical production.
const FIELDS=['treatedTms','headGrade','concentrateGrade','tailGrade','recoveryTheory','concentrateWet','humidity'];
const cell=(r,i)=>Array.isArray(r.source_cells)&&r.source_cells[i]!=null?String(r.source_cells[i]).trim():'';
const date=(v)=>{
  if(typeof v!=='string'||! /^\d{4}-\d{2}-\d{2}$/.test(v))return null;
  const parts=v.split('-').map(Number), t=Date.UTC(parts[0],parts[1]-1,parts[2]);
  return Number.isFinite(t)&&new Date(t).toISOString().slice(0,10)===v?v:null;
};
const numeric=(v)=>{
  const s=String(v??'').trim();
  if(!/^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(s))return null;
  const n=Number(s.replace(',','.'));
  return Number.isFinite(n)?n:null;
};
const valueKey=(v)=>numeric(v)===null?String(v).trim().toUpperCase():String(numeric(v));
const formulaError=(v)=>/^#(?:DIV\/0!|VALUE!|REF!|NUM!|NAME\?|N\/A|NULL!)/i.test(String(v||'').trim());
const varying=(readings)=>FIELDS.filter(field=>new Set(readings.map(r=>r.fields[field])
  .filter(Boolean).map(valueKey)).size>1);
const physicalId=(r)=>(r.sha256||r.attachmentId)+'|'+r.tableIndex+'|'+r.rowIndex;
const values=(r)=>({
  humidity:cell(r,3),treatedTms:cell(r,4),headGrade:cell(r,5),
  concentrateGrade:cell(r,6),tailGrade:cell(r,7),
  recoveryTheory:cell(r,8),concentrateWet:cell(r,9),
});
const hasMeasurement=(v)=>FIELDS.some(f=>v[f]!=='');
const complete=(v)=>{
  const t=numeric(v.treatedTms), g=numeric(v.headGrade);
  return t!==null&&t>0&&g!==null&&g>=0&&g<=100;
};
const median=(values)=>{
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b),half=sorted.length>>1;
  return sorted.length%2?sorted[half]:(sorted[half-1]+sorted[half])/2;
};
export function reconcilePlantShiftEvidence(rows,canonicalRows=[]) {
  const canonical=new Set(canonicalRows.filter(r=>date(r.operation_date)&&r.shift_code)
    .map(r=>r.operation_date+'|'+String(r.shift_code).trim().toUpperCase()));
  const groups=new Map();
  const all=[];
  for(const r of rows){
    const day=date(r.resolved_sample_date), shift=cell(r,2).toUpperCase();
    const identified=Boolean(day&&(shift==='A'||shift==='B'));
    const key=identified?day+'|'+shift:'unknown|'+r.attachment_id+'|'+r.table_index+'|'+r.row_index;
    const record={key,day,shift:identified?shift:null,identified,
      fields:values(r),sha256:r.sha256||null,attachmentId:r.attachment_id,
      messageId:String(r.message_id),tableIndex:r.table_index,rowIndex:r.row_index,
      dateResolution:r.date_resolution||'unresolved'};
    all.push(record);
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(record);
  }
  // A median from distinct physical source rows (same TMS unit) is used ONLY
  // for outlier triage; it does not certify a mine's production capacity.
  const sample=new Map();
  for(const r of all){
    const n=numeric(r.fields.treatedTms);
    if(n!==null&&n>0){
      const physical=(r.sha256||r.attachmentId)+'|'+r.tableIndex+'|'+r.rowIndex;
      if(!sample.has(physical))sample.set(physical,n);
    }
  }
  const baseline=sample.size>=8?median([...sample.values()]):null;
  let duplicateCopies=0;
  const items=[];
  for(const [key,records] of groups){
    // Distinguish OCR disagreements on the same photographed row from
    // independent photographs reporting different values.
    const photos=new Map();
    for(const record of records){
      const physical=physicalId(record);
      if(!photos.has(physical))photos.set(physical,[]);
      photos.get(physical).push(record);
    }
    duplicateCopies+=records.length-photos.size;
    const evidence=[...photos.values()];
    const ocrDisagreementFields=[...new Set(evidence.flatMap(varying))];
    const conflictingFields=FIELDS.filter(field=>{
      const verified=new Set();
      for(const photo of evidence){
        const values=new Set(photo.map(r=>r.fields[field]).filter(Boolean).map(valueKey));
        // Ambiguous OCR on one photograph is not an independent fact.
        if(values.size===1)verified.add([...values][0]);
      }
      return verified.size>1;
    });
    const hasFormulaError=records.some(r=>FIELDS.some(field=>formulaError(r.fields[field])));
    const candidate=records.find(x=>complete(x.fields))||
      records.find(x=>hasMeasurement(x.fields))||records[0];
    const magnitudes=records.map(x=>numeric(x.fields.treatedTms)).filter(x=>x!==null&&x>0);
    const magnitudeAnomaly=baseline!==null&&magnitudes.some(x=>x>baseline*3);
    const status=!candidate.identified?'missing_identity':
      canonical.has(key)?'already_canonical':
      conflictingFields.length>0?'conflicting_sources':
      ocrDisagreementFields.length>0?'ocr_disagreement':
      !records.some(x=>complete(x.fields))?'missing_measurements':
      hasFormulaError?'source_formula_error':
      magnitudeAnomaly?'magnitude_anomaly':'needs_review';
    const ambiguous=new Set([...conflictingFields,...ocrDisagreementFields]);
    items.push({
      key,operationDate:candidate.day,shift:candidate.shift,status,
      treatedTmsRaw:ambiguous.has('treatedTms')?null:candidate.fields.treatedTms||null,
      headGradeRaw:ambiguous.has('headGrade')?null:candidate.fields.headGrade||null,
      sourceCount:records.length,independentSources:photos.size,
      duplicateCount:records.length-photos.size,
      conflictingFields,ocrDisagreementFields,hasFormulaError,magnitudeAnomaly,
      sourceRefs:records.map(x=>({
        messageId:x.messageId,attachmentId:x.attachmentId,
        rowIndex:x.rowIndex,tableIndex:x.tableIndex,
        sha256:x.sha256,treatedTmsRaw:x.fields.treatedTms||null,
        headGradeRaw:x.fields.headGrade||null,humidityRaw:x.fields.humidity||null,
        recoveryRaw:x.fields.recoveryTheory||null,dateResolution:x.dateResolution,
      })),
      originalUnit:'TMS',approvedForCanonicalImport:false,
    });
  }
  items.sort((a,b)=>(b.operationDate||'').localeCompare(a.operationDate||'')||
    (a.shift||'').localeCompare(b.shift||'')||a.key.localeCompare(b.key));
  const dated=items.filter(i=>i.operationDate);
  const measured=dated.filter(i=>i.sourceRefs.some(r=>r.treatedTmsRaw!==null||r.headGradeRaw!==null));
  const completeCases=dated.filter(i=>i.sourceRefs.some(r=>{
    const t=numeric(r.treatedTmsRaw),g=numeric(r.headGradeRaw);
    return t!==null&&t>0&&g!==null&&g>=0&&g<=100;
  }));
  const newest=(list)=>list.length?[...list].sort((a,b)=>b.operationDate.localeCompare(a.operationDate))[0].operationDate:null;
  return {summary:{
    sourceRows:rows.length,reviewCases:items.length,duplicateCopies,
    conflictingSources:items.filter(x=>x.conflictingFields.length>0).length,
    ocrDisagreements:items.filter(x=>x.ocrDisagreementFields.length>0).length,
    formulaErrors:items.filter(x=>x.hasFormulaError).length,
    missingMeasurements:items.filter(x=>x.status==='missing_measurements').length,
    missingIdentity:items.filter(x=>x.status==='missing_identity').length,
    magnitudeAnomalies:items.filter(x=>x.magnitudeAnomaly).length,
    alreadyCanonical:items.filter(x=>x.status==='already_canonical').length,
    latestMeasuredDate:newest(measured),latestCompleteCandidateDate:newest(completeCases),
    latestTemplateDate:newest(dated),baselineTms:baseline,
  },items};
}
