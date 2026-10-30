export const dynamic = 'force-dynamic';
import { NextRequest,NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS,requireModuleAccess } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
import { POST as createWorkOrder } from '@/app/api/maintenance/work-orders/route';

type DecisionInput={sourceKind?:string;sourceId?:string;title?:string;description?:string;workType?:string;priority?:string;scheduledDate?:string;plannedHours?:number;assignedPersonId?:string;action?:string;revision?:number};
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const priorities=new Set(['low','medium','high','critical']);
const types=new Set(['corrective','preventive','general']);
export async function GET(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.MANT_OPERACIONES);
 if(!access.authorized)return access.response;
 const context=await getOrganizationContext(request);if(!context.ok)return context.response;
 const {data,error}=await context.supabase.from('maintenance_planning_decisions')
  .select('id,source_kind,source_id,canonical_asset_id,title,description,work_type,priority,scheduled_date,planned_duration_hours,assigned_person_id,decision_status,revision,approved_at,linked_work_order_id,review_note')
  .eq('organization_id',context.organizationId).limit(250);
 if(error)return NextResponse.json({error:error.message},{status:500});
 return NextResponse.json({decisions:data||[],canWrite:access.canWrite});
}
export async function POST(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.MANT_OPERACIONES,true);
 if(!access.authorized)return access.response;
 const context=await getOrganizationContext(request);if(!context.ok)return context.response;
 try{
 const input=await request.json() as DecisionInput;
 const action=input.action==='approve'?'approve':'save';
 const kind=input.sourceKind;
 if(kind!=='official_weekly'&&kind!=='preventive_priority')return NextResponse.json({error:'Origen no válido'},{status:400});
 if(!input.sourceId||!UUID.test(input.sourceId))return NextResponse.json({error:'Registro de origen no válido'},{status:400});
 const {data:existing,error:existingError}=await context.supabase.from('maintenance_planning_decisions').select('*')
 .eq('organization_id',context.organizationId).eq('source_kind',kind).eq('source_id',input.sourceId).maybeSingle();
 if(existingError)throw existingError;
 if(existing?.decision_status==='generated'||existing?.decision_status==='rejected')return NextResponse.json({error:'Decisión cerrada'},{status:409});
 if(existing?.decision_status==='approved' && action!=='approve')return NextResponse.json({error:'La decisión ya fue aprobada; no puede editarse'},{status:409});
 if(existing?.decision_status==='approved' && action==='approve' && existing.approved_by!==context.authUserId)return NextResponse.json({error:'Solo quien aprobó puede reintentar generar la OT'},{status:403});
 if(existing&&input.revision!==existing.revision)return NextResponse.json({error:'La planificación cambió. Actualiza antes de guardar.'},{status:409});
 let sourceAssetId:string|null=null,sourceTitle='',sourceDate:string|null=null,sourceHours:number|null=null,sourceType='preventive',sourcePriority='medium';
 if(kind==='official_weekly'){
  const {data:source,error}=await context.supabase.from('planning_weekly_work_items')
   .select('id,title,canonical_asset_id,planned_date,planned_hours,work_type_raw,priority_raw,source_id,planning_weekly_work_sources!inner(is_current)')
   .eq('id',input.sourceId).eq('organization_id',context.organizationId).eq('planning_weekly_work_sources.is_current',true).maybeSingle();
  if(error)throw error;if(!source)return NextResponse.json({error:'Trabajo semanal no vigente'},{status:404});
  sourceAssetId=source.canonical_asset_id;sourceTitle=source.title;sourceDate=source.planned_date;sourceHours=source.planned_hours==null?null:Number(source.planned_hours);
  sourceType=String(source.work_type_raw||'').toLowerCase().includes('correctiva')?'corrective':'preventive';
  sourcePriority=String(source.priority_raw||'').toLowerCase().includes('alta')?'high':'medium';
 }else{
  const {data:source,error}=await context.supabase.from('planning_maintenance_priority_v1')
   .select('source_row_id,canonical_asset_id,asset_name,priority,scheduled_date,interval_mp,meter_unit')
   .eq('source_row_id',input.sourceId).eq('organization_id',context.organizationId).maybeSingle();
  if(error)throw error;if(!source)return NextResponse.json({error:'Prioridad preventiva no vigente'},{status:404});
  sourceAssetId=source.canonical_asset_id;sourceTitle='Mantención '+(source.interval_mp||'')+' '+(source.meter_unit||'h')+' · '+(source.asset_name||'Equipo');
  sourceDate=source.scheduled_date;sourcePriority=String(source.priority||'').startsWith('P1')?'critical':String(source.priority||'').startsWith('P2')?'high':'medium';
 }
 const title=String(input.title??existing?.title??sourceTitle).trim();
 const workType=String(input.workType??existing?.work_type??sourceType);
 const priority=String(input.priority??existing?.priority??sourcePriority);
 const plannedDate=input.scheduledDate===undefined?(existing?.scheduled_date??sourceDate):input.scheduledDate||null;
 const hours=input.plannedHours===undefined?(existing?.planned_duration_hours??sourceHours):Number(input.plannedHours);
 const person=input.assignedPersonId===undefined?(existing?.assigned_person_id??null):(input.assignedPersonId||null);
 if(title.length<3||title.length>240||!types.has(workType)||!priorities.has(priority))return NextResponse.json({error:'Revisa título, tipo y prioridad'},{status:400});
 if(plannedDate&&!/^\\d{4}-\\d{2}-\\d{2}$/.test(plannedDate))return NextResponse.json({error:'Fecha inválida'},{status:400});
 if(hours!==null&&(!Number.isFinite(Number(hours))||Number(hours)<0||Number(hours)>240))return NextResponse.json({error:'Horas inválidas'},{status:400});
 if(person&&(!UUID.test(person)))return NextResponse.json({error:'Responsable inválido'},{status:400});
 if(action==='approve'){
  const capability=await getMaintenanceWorkOrderCreationCapability(context);
  if(!capability.canCreate)return NextResponse.json({error:'Tu cargo no puede aprobar la generación de OT'},{status:403});
  if(!person||!sourceAssetId)return NextResponse.json({error:'Vincula un equipo canónico y asigna un ejecutor antes de aprobar'},{status:409});
  if(!plannedDate)return NextResponse.json({error:'Define una fecha para aprobar'},{status:409});
  const {data:assignee,error}=await context.supabase.from('people').select('id').eq('organization_id',context.organizationId).eq('id',person).eq('employment_status','active').not('profile_id','is',null).maybeSingle();
  if(error)throw error;if(!assignee)return NextResponse.json({error:'El ejecutor no está disponible'},{status:409});
  const {data:openOrders,error:orderError}=await context.supabase.from('maintenance_work_orders').select('id,title,scheduled_date,status')
   .eq('organization_id',context.organizationId).eq('canonical_asset_id',sourceAssetId).not('status','in','("completed","closed","cancelled","canceled")').limit(25);
  if(orderError)throw orderError;
  if(existing?.decision_status!=='approved' && (openOrders||[]).some((o:any)=>o.scheduled_date===plannedDate&&o.title?.trim().toLowerCase()===title.toLowerCase()))
   return NextResponse.json({error:'Existe una OT abierta para este equipo, título y fecha. Revisa la orden antes de aprobar.'},{status:409});
 }
 const payload={organization_id:context.organizationId,source_kind:kind,source_id:input.sourceId,canonical_asset_id:sourceAssetId,title,description:input.description??existing?.description??null,work_type:workType,priority,scheduled_date:plannedDate,planned_duration_hours:hours,assigned_person_id:person,decision_status:action==='approve'?'approved':'draft',review_note:'Revisión de Ariel para generar OT',revision:(existing?.revision||0)+1,last_edited_by:context.authUserId,...(action==='approve'?{approved_by:context.authUserId,approved_at:new Date().toISOString()}:{})};
 const {data:decision,error:writeError}=existing?.decision_status==='approved' ? await context.supabase.from('maintenance_planning_decisions').select('*').eq('id',existing.id).eq('organization_id',context.organizationId).single() : await context.supabase.from('maintenance_planning_decisions').upsert(payload,{onConflict:'organization_id,source_kind,source_id'}).select('*').single();
 if(writeError)throw writeError;
 if(action==='save')return NextResponse.json({decision});
 // Approval is explicit. Then reuse the canonical OT endpoint with stable idempotency.
 const hdr=new Headers(request.headers);hdr.set('content-type','application/json');hdr.set('idempotency-key',decision.id);
 const otRequest=new NextRequest(new URL('/api/maintenance/work-orders',request.url),{method:'POST',headers:hdr,body:JSON.stringify({
  planningDecisionId:decision.id,canonicalAssetId:sourceAssetId,assignedPersonId:person,title,description:payload.description,
  workType,priority,scheduledDate:plannedDate,plannedDurationHours:hours||0
 })});
 const created=await createWorkOrder(otRequest);
 const result=await created.json().catch(()=>({}));
 if(!created.ok)return NextResponse.json({error:result.error||'No se pudo generar la OT',approved:true,decisionId:decision.id},{status:created.status});
 return NextResponse.json({decisionId:decision.id,workOrderId:result.data?.id,workOrderNumber:result.data?.work_order_number,approved:true});
 }catch(e){return NextResponse.json({error:e instanceof Error?e.message:'No se pudo guardar la planificación'},{status:500})}
}
