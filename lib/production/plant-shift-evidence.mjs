
const cell=(r,i)=>Array.isArray(r.source_cells)&&r.source_cells[i]!=null?String(r.source_cells[i]).trim():'';
const date=(v)=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)?v:null;
const numeric=(value)=>{const s=String(value??'').trim();return /^-?(?:\d+(?:[.,]\d*)?|[.,]\d+)$/.test(s)&&Number.isFinite(Number(s.replace(',','.')))?Number(s.replace(',','.')):null};
const values=(row)=>({humidity:cell(row,3),treatedTms:cell(row,4),headGrade:cell(row,5),concentrateGrade:cell(row,6),tailGrade:cell(row,7),recoveryTheory:cell(row,8),concentrateWet:cell(row,9)});
const signature=(v)=>JSON.stringify([v.humidity,v.treatedTms,v.headGrade,v.concentrateGrade,v.tailGrade,v.recoveryTheory,v.concentrateWet]);
const hasMeasurement=(v)=>v.treatedTms!==''||v.headGrade!==''||v.concentrateGrade!==''||v.tailGrade!=='';
const usable=(v)=>{const t=numeric(v.treatedTms),g=numeric(v.headGrade);return t!==null&&t>0&&g!==null&&g>=0&&g<=100};

export function reconcilePlantShiftEvidence(rows, canonicalRows=[]) {
  const canonical=new Set(canonicalRows.filter(r=>date(r.operation_date)&&r.shift_code)
    .map(r=>r.operation_date+'|'+String(r.shift_code).trim().toUpperCase()));
  const groups=new Map();
  for(const r of rows) {
    const day=date(r.resolved_sample_date),shift=cell(r,2).toUpperCase();
    const identified=Boolean(day&&(shift==='A'||shift==='B'));
    const key=identified?day+'|'+shift:'unknown|'+r.attachment_id+'|'+r.table_index+'|'+r.row_index;
    const item={key,day,shift:identified?shift:null,identified,
      fields:values(r),sha256:r.sha256||null,attachmentId:r.attachment_id,
      messageId:String(r.message_id),tableIndex:r.table_index,rowIndex:r.row_index,
      dateResolution:r.date_resolution};
    if(!groups.has(key))groups.set(key,[]);
    groups.get(key).push(item);
  }
  let duplicateCopies=0;
  const items=[];
  for(const [key,records] of groups) {
    const unique=new Map();
    for(const record of records){
      const fingerprint=signature(record.fields);
      const id=record.identified?fingerprint:(record.sha256||record.attachmentId)+'|'+record.tableIndex+'|'+record.rowIndex;
      if(!unique.has(id))unique.set(id,record);
    }
    duplicateCopies+=records.length-unique.size;
    const readings=[...unique.values()];
    const measured=readings.filter(x=>hasMeasurement(x.fields));
    const different=new Set(measured.map(x=>signature(x.fields)));
    const candidate=readings.find(x=>usable(x.fields))||readings.find(x=>hasMeasurement(x.fields))||readings[0];
    const status=!candidate.identified?'missing_identity':
      canonical.has(key)?'already_canonical':
      different.size>1?'conflicting_sources':
      !readings.some(x=>usable(x.fields))?'missing_measurements':'needs_review';
    items.push({key,operationDate:candidate.day,shift:candidate.shift,status,
      treatedTmsRaw:different.size>1?null:candidate.fields.treatedTms||null,
      headGradeRaw:different.size>1?null:candidate.fields.headGrade||null,
      sourceCount:records.length,duplicateCount:records.length-unique.size,
      sourceRefs:records.map(x=>({messageId:x.messageId,attachmentId:x.attachmentId,
        rowIndex:x.rowIndex,tableIndex:x.tableIndex,sha256:x.sha256})),
      originalUnit:'TMS',approvedForCanonicalImport:false});
  }
  items.sort((a,b)=>(b.operationDate||'').localeCompare(a.operationDate||'')||(a.shift||'').localeCompare(b.shift||'')||a.key.localeCompare(b.key));
  const dates=items.map(i=>i.operationDate).filter(Boolean).sort();
  return {summary:{
    sourceRows:rows.length,reviewCases:items.length,duplicateCopies,
    conflictingSources:items.filter(x=>x.status==='conflicting_sources').length,
    missingMeasurements:items.filter(x=>x.status==='missing_measurements').length,
    missingIdentity:items.filter(x=>x.status==='missing_identity').length,
    alreadyCanonical:items.filter(x=>x.status==='already_canonical').length,
    earliestEvidenceDate:dates[0]||null,latestEvidenceDate:dates.at(-1)||null,
  },items};
}
