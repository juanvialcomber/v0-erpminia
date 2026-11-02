export const dynamic='force-dynamic';

import {NextRequest,NextResponse} from 'next/server';
import {getOrganizationContext} from '@/lib/api/organization-context';
import {MODULE_KEYS,requireModuleAccess} from '@/lib/api/module-access';

type AreaStatus='ready_for_review'|'current_source'|'review_required'|'baseline_loaded'|'awaiting_source';

async function count(query:PromiseLike<{count:number|null;error:{message:string}|null}>){
  const result=await query;
  if(result.error) throw new Error(result.error.message);
  return result.count??0;
}

export async function GET(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.MANT_OPERACIONES);
  if(!access.authorized)return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok)return context.response;
  const db=context.supabase;
  try{
    const {data:weeklySources,error:weeklyError}=await db.from('planning_weekly_work_sources')
      .select('id,mine,week_start,week_end,reported_at')
      .eq('organization_id',context.organizationId).eq('is_current',true);
    if(weeklyError)throw weeklyError;
    const weeklyIds=(weeklySources||[]).map(row=>row.id);
    const maintenanceItems=weeklyIds.length?await count(db.from('planning_weekly_work_items').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).in('source_id',weeklyIds)):0;

    const [
      productionSource,
      productionHold,
      bodegaAuthority,
      bodegaReconciliation,
      procurementIntake,
      procurementOrders,
      procurementExceptions,
      financePayables,
      financeAssets,
      geologyHoles,
      geologyHypotheses,
      geologyImages,
      rrhhPeople,
      rrhhActive,
      rrhhWithoutProfile,
      rrhhOpenCases,
      hseOpenNonconformances,
      legalOpenCases,
    ]=await Promise.all([
      db.from('production_source_documents').select('source_file,period_end')
        .eq('organization_id',context.organizationId).eq('canonical_role','canonical')
        .ilike('source_file','ESTADISTICAS DE PRODUCCION %.xlsx')
        .order('period_end',{ascending:false}).limit(1).maybeSingle(),
      count(db.from('production_master_normalization_quality_v1').select('*',{count:'exact',head:true}).eq('organization_id',context.organizationId).neq('status','PASS')),
      db.from('bodega_stock_source_authority_service_v1').select('latest_laudus_stock_date,latest_laudus_stock_sync,authority_state,authority_reason').eq('organization_id',context.organizationId).maybeSingle(),
      db.from('laudus_inventory_reconciliation_summary_service_v1').select('aligned_products,quantity_mismatches,missing_in_motil_nonzero,laudus_negative_products,latest_laudus_stock_sync').eq('organization_id',context.organizationId).maybeSingle(),
      count(db.from('procurement_intake_requests').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('procurement_operational_orders').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('procurement_match_exceptions').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).not('status','in','("resolved","closed")')),
      count(db.from('procurement_accounts_payable').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('motil_finance_asset_stage').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('production_drill_holes').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('production_geology_hypotheses').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('production_geology_core_images').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('people').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('people').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).eq('employment_status','active')),
      count(db.from('people').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).is('profile_id',null)),
      count(db.from('people_case_events').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).neq('review_status','closed')),
      count(db.from('sostenibilidad_nonconformances').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).in('status',['abierta','open'])),
      count(db.from('legal_cases').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId).neq('status','closed')),
    ]);

    if(productionSource.error)throw productionSource.error;
    if(bodegaAuthority.error)throw bodegaAuthority.error;
    if(bodegaReconciliation.error)throw bodegaReconciliation.error;

    const latestMaintenance=(weeklySources||[]).map(row=>row.week_end).filter(Boolean).sort().at(-1)||null;
    const prod=productionSource.data;
    const auth=bodegaAuthority.data;
    const rec=bodegaReconciliation.data;

    const areas:Array<{key:string;name:string;status:AreaStatus;cutoff:string|null;facts:string[];nextAction:string;href:string}>=[
      {
        key:'maintenance',name:'Mantenimiento',status:weeklyIds.length?'ready_for_review':'awaiting_source',cutoff:latestMaintenance,
        facts:[`${weeklyIds.length} programas semanales vigentes`,`${maintenanceItems} trabajos en planificación`],
        nextAction:weeklyIds.length?'Revisar y aprobar la planificación semanal':'Solicitar programa semanal vigente',
        href:'/dashboard/mantenimiento/planificacion-semanal',
      },
      {
        key:'production',name:'Producción',status:prod?.period_end?'current_source':'awaiting_source',cutoff:prod?.period_end||null,
        facts:[prod?.source_file||'Sin estadística canónica reciente',`${productionHold} controles de calidad por revisar`],
        nextAction:productionHold>0?'Validar controles de calidad del corte actual':'Revisar resumen del último corte',
        href:'/dashboard/produccion',
      },
      {
        key:'bodega',name:'Bodega',status:Number(rec?.quantity_mismatches||0)>0?'review_required':auth?.authority_state==='laudus_primary'?'current_source':'awaiting_source',cutoff:auth?.latest_laudus_stock_date||null,
        facts:[auth?.authority_state==='laudus_primary'?'Laudus es fuente primaria':'Autoridad de stock por revisar',`${Number(rec?.quantity_mismatches||0)} diferencias de cantidad · ${Number(rec?.laudus_negative_products||0)} saldos negativos Laudus`],
        nextAction:Number(rec?.quantity_mismatches||0)>0?'Conciliar diferencias antes de ajustar stock':'Revisar stock vigente',
        href:'/dashboard/bodega',
      },
      {
        key:'procurement',name:'Compras',status:procurementExceptions>0?'review_required':procurementOrders>0?'ready_for_review':'awaiting_source',cutoff:null,
        facts:[`${procurementIntake} solicitudes · ${procurementOrders} órdenes operativas`,`${procurementExceptions} excepciones de conciliación abiertas`],
        nextAction:procurementExceptions>0?'Resolver excepciones de matching':'Revisar flujo de abastecimiento',
        href:'/dashboard/compras',
      },
      {
        key:'finance',name:'Finanzas',status:financePayables>0||financeAssets>0?'ready_for_review':'awaiting_source',cutoff:null,
        facts:[`${financePayables} cuentas por pagar operativas`,`${financeAssets} registros de activos financieros en staging`],
        nextAction:'Revisar prioridades, CxP y conciliación de activos',
        href:'/dashboard/finanzas',
      },
      {
        key:'geology',name:'Geología',status:geologyHoles>0?'baseline_loaded':'awaiting_source',cutoff:null,
        facts:[`${geologyHoles} sondajes cargados`,`${geologyHypotheses} hipótesis · ${geologyImages} imágenes de testigo`],
        nextAction:geologyHypotheses===0&&geologyImages===0?'Levantar workflow operativo y evidencia de campo':'Revisar hipótesis y evidencia',
        href:'/dashboard/produccion/geologia',
      },
      {
        key:'rrhh',name:'RRHH',status:rrhhPeople>0&&rrhhWithoutProfile===0?'ready_for_review':rrhhPeople>0?'review_required':'awaiting_source',cutoff:null,
        facts:[`${rrhhPeople} personas canónicas · ${rrhhActive} activas`,`${rrhhWithoutProfile} sin acceso vinculado · ${rrhhOpenCases} casos abiertos`],
        nextAction:rrhhWithoutProfile>0?'Conciliar identidades antes de atribuir evidencia':'Revisar fichas, cargos y evidencia operacional',
        href:'/dashboard/rrhh',
      },
      {
        key:'sustainability',name:'Sostenibilidad / HSE',status:hseOpenNonconformances>0?'review_required':'ready_for_review',cutoff:null,
        facts:[`${hseOpenNonconformances} no conformidades abiertas`,'Cumplimiento sólo se interpreta desde evidencia confirmada'],
        nextAction:hseOpenNonconformances>0?'Revisar no conformidades y acciones asociadas':'Validar cobertura de inspecciones, EPP y documentación HSE',
        href:'/dashboard/sostenibilidad',
      },
      {
        key:'legal',name:'Legal',status:legalOpenCases>0?'review_required':'ready_for_review',cutoff:null,
        facts:[`${legalOpenCases} casos legales abiertos`,'La evidencia candidata no acredita aplicabilidad ni cumplimiento'],
        nextAction:legalOpenCases>0?'Priorizar casos abiertos y evidencia pendiente':'Revisar vencimientos y cobertura contractual',
        href:'/dashboard/legal',
      },
    ];

    return NextResponse.json({areas,generatedAt:new Date().toISOString(),authority:'Resumen de coordinación; cada jefe de área valida su propia información.'},{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'No se pudo construir el estado de áreas'},{status:500});
  }
}
