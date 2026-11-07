export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { createHash } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { loadXlsxModule, sheetToMatrix, type XlsxCellValue } from '@/lib/xlsx';
import { POST as createWorkOrder } from '@/app/api/maintenance/work-orders/route';
import { chileTodayDateKey } from '@/lib/maintenance/work-order-calendar-date.mjs';

const MAX_BYTES = 10 * 1024 * 1024;
const BUCKET = 'maintenance-work-order-evidence';

const normalize=(value:unknown)=>String(value??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
const text=(value:XlsxCellValue)=>String(value??'').trim().replace(/\s+/g,' ');
const num=(value:XlsxCellValue)=>{if(typeof value==='number'&&Number.isFinite(value))return value;const parsed=Number(String(value??'').replace(/\./g,'').replace(',','.').replace(/[^0-9.-]/g,''));return Number.isFinite(parsed)?parsed:null;};
const date=(value:XlsxCellValue)=>{if(value instanceof Date&&!Number.isNaN(value.getTime()))return value.toISOString().slice(0,10);const raw=String(value??'').trim();const parsed=new Date(raw);return Number.isNaN(parsed.getTime())?null:parsed.toISOString().slice(0,10);};

function detectMine(rows:XlsxCellValue[][],sheetName:string){
 const joined=normalize([sheetName,...rows.slice(0,8).flat().map(text)].join(' '));
 if(joined.includes('don jaime'))return 'Mina Don Jaime';
 if(joined.includes('peumo'))return 'Mina Peumo';
 if(joined.includes('san pedro'))return 'Mina San Pedro';
 if(joined.includes('raiz del cobre'))return 'Mina Raíz del Cobre';
 if(joined.includes('planta'))return 'Planta';
 return null;
}

function findWeekStart(rows:XlsxCellValue[][]){
 for(const row of rows.slice(0,12)){
  const normalized=row.map(cell=>normalize(cell));
  const idx=normalized.findIndex(cell=>cell.includes('semana desde'));
  if(idx>=0){
   for(let c=idx+1;c<Math.min(row.length,idx+4);c++){const found=date(row[c]);if(found)return found;}
  }
 }
 return null;
}

function addDays(iso:string,days:number){const d=new Date(iso+'T12:00:00Z');d.setUTCDate(d.getUTCDate()+days);return d.toISOString().slice(0,10);}

function parseProgram(sheetName:string,rows:XlsxCellValue[][]){
 const mine=detectMine(rows,sheetName);
 const weekStart=findWeekStart(rows);
 if(!mine||!weekStart)return null;
 const headerIndex=rows.findIndex(row=>{
  const n=row.map(cell=>normalize(cell));
  return n.some(cell=>cell==='fecha programada')&&n.some(cell=>cell==='equipo')&&n.some(cell=>cell.includes('actividad'));
 });
 if(headerIndex<0)return null;
 const h=rows[headerIndex].map(cell=>normalize(cell));
 const col=(...names:string[])=>h.findIndex(cell=>names.some(name=>cell.includes(name)));
 const activityCol=col('n');
 const dateCol=col('fecha programada');
 const shiftCol=col('turno');
 const assignedCol=col('responsable');
 const assetCol=col('equipo');
 const titleCol=col('actividad','trabajo');
 const typeCol=col('clasificacion');
 const priorityCol=col('prioridad');
 const plannedCol=col('hh planificadas');
 const actualCol=col('hh reales');
 const statusCol=col('estado');
 const progressCol=col('avance');
 const executionCol=col('fecha ejecucion');
 const observationsCol=col('observaciones','motivo');
 const materialsCol=col('repuestos','insumos');

 const items:any[]=[];
 for(let r=headerIndex+1;r<rows.length;r++){
  const row=rows[r]||[];
  const first=normalize(row[0]);
  if(first==='emergencias'||first==='n emergencias')break;
  const asset=assetCol>=0?text(row[assetCol]):'';
  const title=titleCol>=0?text(row[titleCol]):'';
  if(!asset||!title)continue;
  const sourcePayload=Object.fromEntries(rows[headerIndex].map((cell,i)=>[text(cell)||'col_'+(i+1),row[i]??null]));
  const rowHash=createHash('sha256').update(JSON.stringify(sourcePayload)).digest('hex');
  const rawProgress=progressCol>=0?num(row[progressCol]):null;
  items.push({
   source_row:r+1,
   activity_number:activityCol>=0?text(row[activityCol])||null:null,
   planned_date:dateCol>=0?date(row[dateCol]):null,
   shift_name:shiftCol>=0?text(row[shiftCol])||null:null,
   assigned_name:assignedCol>=0?text(row[assignedCol])||null:null,
   asset_label:asset,
   title,
   work_type_raw:typeCol>=0?text(row[typeCol])||null:null,
   priority_raw:priorityCol>=0?text(row[priorityCol])||null:null,
   planned_hours:plannedCol>=0?num(row[plannedCol]):null,
   reported_hours:actualCol>=0?num(row[actualCol]):null,
   source_status:statusCol>=0?text(row[statusCol])||null:null,
   source_progress:rawProgress==null?null:(rawProgress>1?rawProgress/100:rawProgress),
   execution_date:executionCol>=0?date(row[executionCol]):null,
   observations:observationsCol>=0?text(row[observationsCol])||null:null,
   materials:materialsCol>=0?text(row[materialsCol])||null:null,
   source_payload:sourcePayload,
   row_hash:rowHash,
  });
 }
 const declared=rows.slice(0,12).flatMap(row=>row.map((cell,i)=>({i,label:normalize(cell),row})))
  .find(entry=>entry.label==='reguistrados'||entry.label==='registrados');
 let declaredCount:number|null=null;
 if(declared){
  const idx=declared.i;
  for(const row of rows.slice(0,12)){
   if(normalize(row[idx])==='reguistrados'||normalize(row[idx])==='registrados'){
    const candidate=num(rows[rows.indexOf(row)+1]?.[idx]);
    if(candidate!=null)declaredCount=candidate;
   }
  }
 }
 return {sheetName,mine,weekStart,weekEnd:addDays(weekStart,6),items,declaredCount};
}

async function createEligibleOrders({
 request,context,sourceId,mine,sourceFile,sha256,items,peopleByName,
}:{
 request:NextRequest;
 context:Awaited<ReturnType<typeof getOrganizationContext>> & {ok:true};
 sourceId:string;
 mine:string;
 sourceFile:string;
 sha256:string;
 items:any[];
 peopleByName:Map<string,Array<any>>;
}){
 const today=chileTodayDateKey();
 const automation={created:0,replayed:0,skippedLinked:0,skippedPast:0,skippedCompleted:0,skippedIdentity:0,skippedClassification:0,errors:[] as string[]};
 for(const item of items){
  if(item.linked_work_order_id){automation.skippedLinked+=1;continue;}
  const status=normalize(item.source_status);
  if(status.includes('terminado')||status.includes('completado')||status.includes('cerrado')){automation.skippedCompleted+=1;continue;}
  if(!item.planned_date||item.planned_date<today){automation.skippedPast+=1;continue;}
  const assignees=peopleByName.get(normalize(item.assigned_name))||[];
  const assignee=assignees.length===1?assignees[0]:null;
  if(!item.canonical_asset_id||item.reconciliation_status!=='matched'||!assignee){automation.skippedIdentity+=1;continue;}
  const priorityRaw=normalize(item.priority_raw);
  const priority=priorityRaw.includes('crit')?'critical':priorityRaw.includes('alta')?'high':priorityRaw.includes('baja')?'low':'medium';
  const workTypeRaw=normalize(item.work_type_raw);
  const workType=workTypeRaw.includes('correct')?'corrective':workTypeRaw.includes('prevent')?'preventive':workTypeRaw.includes('predict')?'predictive':null;
  if(!workType){automation.skippedClassification+=1;automation.errors.push(`Fila ${item.source_row}: clasificación de trabajo no reconocida`);continue;}
  const headers=new Headers(request.headers);headers.set('content-type','application/json');headers.set('idempotency-key',item.id);
  const internalRequest=new NextRequest(new URL('/api/maintenance/work-orders',request.url),{method:'POST',headers,body:JSON.stringify({
   canonicalAssetId:item.canonical_asset_id,assignedPersonId:assignee.id,title:item.title,
   description:`Programa semanal oficial de Ariel · ${mine} · fila ${item.source_row}`,
   requestedMaterials:item.materials||null,workType,priority,scheduledDate:item.planned_date,
   plannedDurationHours:Number(item.planned_hours||0),
  })});
  const created=await createWorkOrder(internalRequest);
  const payload=await created.json().catch(()=>({}));
  if(created.ok&&payload?.data?.id){
   if(payload?.idempotentReplay===true)automation.replayed+=1;else automation.created+=1;
   const {error:linkError}=await context.supabase.from('planning_weekly_work_items').update({linked_work_order_id:payload.data.id,updated_at:new Date().toISOString()}).eq('organization_id',context.organizationId).eq('id',item.id);
   if(linkError)automation.errors.push(`Fila ${item.source_row}: OT creada pero no vinculada`);
   else{
    const {data:event}=await context.supabase.from('work_order_events').select('id').eq('organization_id',context.organizationId).eq('work_order_id',payload.data.id).eq('event_type','official_weekly_program_imported').eq('source_record_id',item.id).limit(1).maybeSingle();
    if(!event)await context.supabase.from('work_order_events').insert({organization_id:context.organizationId,work_order_id:payload.data.id,canonical_asset_id:item.canonical_asset_id,event_type:'official_weekly_program_imported',actor_id:context.authUserId,actor_name:context.userName||null,source_table:'planning_weekly_work_items',source_record_id:item.id,summary:'OT creada automáticamente desde programa semanal oficial de Ariel',payload:{source_id:sourceId,source_row:item.source_row,source_file:sourceFile,source_sha256:sha256,planned_date:item.planned_date}});
   }
  }else automation.errors.push(`Fila ${item.source_row}: ${payload?.error||'no se pudo crear OT'}`);
 }
 return automation;
}

export async function POST(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.MANT_OPERACIONES,true);
 if(!access.authorized)return access.response;
 const context=await getOrganizationContext(request);if(!context.ok)return context.response;
 const form=await request.formData();
 const file=form.get('file');
 if(!(file instanceof File))return NextResponse.json({error:'Archivo requerido'},{status:400});
 if(!/\.(xlsx|xls)$/i.test(file.name)||file.size<=0||file.size>MAX_BYTES)return NextResponse.json({error:'Usa un XLS/XLSX de hasta 10 MB'},{status:400});
 const bytes=Buffer.from(await file.arrayBuffer());
 const sha256=createHash('sha256').update(bytes).digest('hex');
 const xlsx=await loadXlsxModule();
 const workbook=xlsx.read(bytes,{type:'buffer',cellDates:true});
 const parsed=workbook.SheetNames.map(sheetName=>{
  const sheet=workbook.Sheets[sheetName];
  return sheet?parseProgram(sheetName,sheetToMatrix(xlsx,sheet,true)):null;
 }).filter(Boolean) as Array<ReturnType<typeof parseProgram> extends infer T ? Exclude<T,null> : never>;
 if(!parsed.length)return NextResponse.json({error:'No se encontró una hoja de programa semanal reconocible'},{status:422});
 if(parsed.length>1)return NextResponse.json({error:'El archivo contiene más de una hoja de programa semanal. Sepáralas para preservar trazabilidad por faena.',sheets:parsed.map(program=>program.sheetName)},{status:422});
 const program=parsed[0];

 const {data:existing}=await context.supabase.from('planning_weekly_work_sources')
  .select('id,mine,week_start,week_end,is_current').eq('organization_id',context.organizationId)
  .eq('source_sha256',sha256).eq('source_sheet',program.sheetName).maybeSingle();
 if(existing){
  const [{data:existingItems,error:itemError},{data:people,error:peopleError}]=await Promise.all([
   context.supabase.from('planning_weekly_work_items').select('id,source_row,planned_date,assigned_name,canonical_asset_id,title,work_type_raw,priority_raw,planned_hours,source_status,materials,reconciliation_status,linked_work_order_id').eq('organization_id',context.organizationId).eq('source_id',existing.id).order('source_row'),
   context.supabase.from('people').select('id,full_name,role_title,profile_id').eq('organization_id',context.organizationId).eq('employment_status','active').not('profile_id','is',null).limit(2000),
  ]);
  if(itemError||peopleError)return NextResponse.json({error:(itemError||peopleError)?.message||'No se pudo revalidar el programa existente'},{status:500});
  const peopleByName=new Map<string,Array<any>>();
  for(const person of people||[]){const key=normalize(person.full_name);const list=peopleByName.get(key)||[];list.push(person);peopleByName.set(key,list);}
  const automation=await createEligibleOrders({request,context,sourceId:existing.id,mine:program.mine,sourceFile:file.name,sha256,items:existingItems||[],peopleByName});
  return NextResponse.json({ok:true,duplicate:true,source:existing,summary:{parsed:program.items.length,declared:program.declaredCount,mismatch:program.declaredCount!=null&&program.declaredCount!==program.items.length},automation});
 }

 const storagePath=`${context.organizationId}/weekly-programs/${Date.now()}-${file.name.replace(/[^a-zA-Z0-9._-]+/g,'_')}`;
 const upload=await context.supabase.storage.from(BUCKET).upload(storagePath,bytes,{contentType:file.type||'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',upsert:false});
 if(upload.error)return NextResponse.json({error:'No se pudo preservar el archivo fuente'},{status:503});

 try{
  const mismatch=program.declaredCount!=null&&program.declaredCount!==program.items.length;
  const {data:source,error:sourceError}=await context.supabase.from('planning_weekly_work_sources').insert({
   organization_id:context.organizationId,source_file:file.name,source_sha256:sha256,source_sheet:program.sheetName,
   source_url:`storage:${BUCKET}/${storagePath}`,mine:program.mine,week_start:program.weekStart,week_end:program.weekEnd,
   reported_at:new Date().toISOString(),source_owner:'Ariel López',status:mismatch?'review_required':'official_source',is_current:false,
  }).select('id,mine,week_start,week_end,status').single();
  if(sourceError)throw sourceError;

  const [{data:assets,error:assetError},{data:people,error:peopleError},{data:historicalLinks,error:historicalError}]=await Promise.all([
   context.supabase.from('maintenance_canonical_assets_v1').select('id,asset_code,name,location').eq('organization_id',context.organizationId).eq('is_active',true).limit(5000),
   context.supabase.from('people').select('id,full_name,role_title,profile_id').eq('organization_id',context.organizationId).eq('employment_status','active').not('profile_id','is',null).limit(2000),
   context.supabase.from('planning_weekly_work_items').select('asset_label,canonical_asset_id').eq('organization_id',context.organizationId).eq('reconciliation_status','matched').not('canonical_asset_id','is',null).limit(5000),
  ]);
  if(assetError)throw assetError;if(peopleError)throw peopleError;if(historicalError)throw historicalError;
  const byName=new Map<string,Array<any>>();
  for(const asset of assets||[]){
   for(const key of [normalize(asset.name),normalize(asset.asset_code)].filter(Boolean)){
    const list=byName.get(key)||[];list.push(asset);byName.set(key,list);
   }
  }
  const historicalByLabel=new Map<string,Set<string>>();
  for(const row of historicalLinks||[]){const key=normalize(row.asset_label);if(!key||!row.canonical_asset_id)continue;const ids=historicalByLabel.get(key)||new Set<string>();ids.add(String(row.canonical_asset_id));historicalByLabel.set(key,ids);}
  const peopleByName=new Map<string,Array<any>>();
  for(const person of people||[]){const key=normalize(person.full_name);const list=peopleByName.get(key)||[];list.push(person);peopleByName.set(key,list);}
  const rows=program.items.map(item=>{
   const labelKey=normalize(item.asset_label);
   const matches=byName.get(labelKey)||[];
   const historicalIds=Array.from(historicalByLabel.get(labelKey)||[]);
   const exact=matches.length===1?matches[0]:historicalIds.length===1?assets?.find(asset=>asset.id===historicalIds[0])||null:null;
   const ambiguous=matches.length>1||historicalIds.length>1;
   return {...item,organization_id:context.organizationId,source_id:source.id,canonical_asset_id:exact?.id||null,
    reconciliation_status:exact?'matched':ambiguous?'ambiguous':'review_required',
    review_reason:exact?(matches.length===1?null:'Vínculo reutilizado desde programas semanales oficiales previamente conciliados'):ambiguous?'Más de un equipo coincide con la etiqueta fuente':'Equipo fuente no coincide exactamente con maestro canónico'};
  });
  let insertedItems:any[]=[];
  if(rows.length){const {data,error:itemError}=await context.supabase.from('planning_weekly_work_items').insert(rows).select('id,source_row,planned_date,assigned_name,canonical_asset_id,title,work_type_raw,priority_raw,planned_hours,source_status,materials,reconciliation_status');if(itemError)throw itemError;insertedItems=data||[];}
  await context.supabase.from('planning_weekly_work_sources').update({is_current:false}).eq('organization_id',context.organizationId).eq('mine',program.mine).eq('is_current',true).neq('id',source.id);
  const {error:promoteError}=await context.supabase.from('planning_weekly_work_sources').update({is_current:true}).eq('organization_id',context.organizationId).eq('id',source.id);
  if(promoteError)throw promoteError;

  const automation=await createEligibleOrders({request,context,sourceId:source.id,mine:program.mine,sourceFile:file.name,sha256,items:insertedItems,peopleByName});

  return NextResponse.json({ok:true,source,summary:{parsed:rows.length,declared:program.declaredCount,mismatch,matched:rows.filter(r=>r.reconciliation_status==='matched').length,review:rows.filter(r=>r.reconciliation_status!=='matched').length},automation,
   authority:mismatch?'Archivo preservado. Las filas válidas desde hoy generan OT automáticamente; la diferencia resumen/detalle queda marcada para revisión.':'Fuente semanal incorporada. Las filas válidas desde hoy generan OT automáticamente.'},{status:201});
 }catch(error){
  await context.supabase.storage.from(BUCKET).remove([storagePath]).catch(()=>undefined);
  return NextResponse.json({error:error instanceof Error?error.message:'No se pudo incorporar el programa semanal'},{status:500});
 }
}
