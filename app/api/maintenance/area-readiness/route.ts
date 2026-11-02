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
      plantShifts,
      plantLatest,
      metallurgyResults,
      transportRows,
      transportLatest,
      drillingReports,
      drillingLatest,
      activeEngineeringPlan,
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
      count(db.from('production_plant_shifts').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      db.from('production_plant_shifts').select('operation_date').eq('organization_id',context.organizationId).order('operation_date',{ascending:false}).limit(1).maybeSingle(),
      count(db.from('production_metallurgy_results').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      count(db.from('production_material_movements').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      db.from('production_material_movements').select('movement_date').eq('organization_id',context.organizationId).order('movement_date',{ascending:false}).limit(1).maybeSingle(),
      count(db.from('production_drilling_source_reports').select('id',{count:'exact',head:true}).eq('organization_id',context.organizationId)),
      db.from('production_drilling_source_reports').select('operation_date').eq('organization_id',context.organizationId).order('operation_date',{ascending:false}).limit(1).maybeSingle(),
      db.from('production_monthly_plans').select('plan_code,period_start,period_end,status').eq('organization_id',context.organizationId).eq('status','active').order('period_start',{ascending:false}).limit(1).maybeSingle(),
    ]);

    if(productionSource.error)throw productionSource.error;
    if(bodegaAuthority.error)throw bodegaAuthority.error;
    if(bodegaReconciliation.error)throw bodegaReconciliation.error;
    if(plantLatest.error)throw plantLatest.error;
    if(transportLatest.error)throw transportLatest.error;
    if(drillingLatest.error)throw drillingLatest.error;
    if(activeEngineeringPlan.error)throw activeEngineeringPlan.error;

    const latestMaintenance=(weeklySources||[]).map(row=>row.week_end).filter(Boolean).sort().at(-1)||null;
    const prod=productionSource.data;
    const auth=bodegaAuthority.data;
    const rec=bodegaReconciliation.data;
    const {data:mineSourceRows,error:mineSourceError}=prod?.source_file
      ? await db.from('production_source_normalized_records')
          .select('record_type,normalized_values')
          .eq('organization_id',context.organizationId)
          .eq('source_file',prod.source_file)
          .eq('semantic_status','source_reported')
          .in('record_type',['extraction_actual_peumo','extraction_plan_peumo','extraction_actual_don_jaime','extraction_plan_don_jaime'])
      : {data:[],error:null};
    if(mineSourceError)throw mineSourceError;
    const mineValue=(recordType:string)=>{
      const row=(mineSourceRows||[]).find(item=>item.record_type===recordType);
      const raw=(row?.normalized_values as {value?:unknown}|null)?.value;
      return typeof raw==='number'&&Number.isFinite(raw)?raw:null;
    };
    const peumoActual=mineValue('extraction_actual_peumo');
    const peumoPlan=mineValue('extraction_plan_peumo');
    const jaimeActual=mineValue('extraction_actual_don_jaime');
    const jaimePlan=mineValue('extraction_plan_don_jaime');

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
        key:'mine-peumo',name:'Mina Peumo',status:peumoActual!==null?'current_source':'awaiting_source',cutoff:prod?.period_end||null,
        facts:[peumoActual===null?'Sin extracción actual acreditada':`${peumoActual.toLocaleString('es-CL',{maximumFractionDigits:1})} t extraídas a planta`,peumoPlan===null?'Sin plan comparable en la fuente':`${peumoPlan.toLocaleString('es-CL',{maximumFractionDigits:1})} t planificadas al corte`],
        nextAction:'Validar extracción, sectores y trabajos del corte con Jefatura de Mina',
        href:'/dashboard/produccion',
      },
      {
        key:'mine-don-jaime',name:'Mina Don Jaime',status:jaimeActual!==null?'current_source':'awaiting_source',cutoff:prod?.period_end||null,
        facts:[jaimeActual===null?'Sin extracción actual acreditada':`${jaimeActual.toLocaleString('es-CL',{maximumFractionDigits:1})} t extraídas a planta`,jaimePlan===null?'Sin plan comparable en la fuente':`${jaimePlan.toLocaleString('es-CL',{maximumFractionDigits:1})} t planificadas al corte`],
        nextAction:'Validar extracción, sectores y trabajos del corte con Jefatura de Mina',
        href:'/dashboard/produccion',
      },
      {
        key:'plant',name:'Planta / Metalurgia',status:plantShifts>0?'baseline_loaded':'awaiting_source',cutoff:plantLatest.data?.operation_date||null,
        facts:[`${plantShifts} turnos de planta · ${metallurgyResults} resultados metalúrgicos`,'El detalle canónico debe distinguirse del corte fuente más reciente de Producción'],
        nextAction:'Actualizar y conciliar turnos/leyes posteriores al último corte detallado',
        href:'/dashboard/produccion/planta-metalurgia',
      },
      {
        key:'transport',name:'Transporte de Mineral',status:transportRows>0?'baseline_loaded':'awaiting_source',cutoff:transportLatest.data?.movement_date||null,
        facts:[`${transportRows} movimientos canónicos`,'La fecha de corte se muestra explícitamente para no confundir histórico con operación actual'],
        nextAction:'Actualizar movimientos posteriores al corte y conciliar mina, sector y tonelaje',
        href:'/dashboard/produccion/transporte-mineral',
      },
      {
        key:'drilling',name:'Perforación',status:drillingReports>0?'baseline_loaded':'awaiting_source',cutoff:drillingLatest.data?.operation_date||null,
        facts:[`${drillingReports} reportes fuente · ${geologyHoles} sondajes canónicos`,'La resolución mina/sector y la evidencia de ejecución deben conservarse separadas'],
        nextAction:'Actualizar reportes y cerrar pendientes de reconciliación espacial',
        href:'/dashboard/produccion/sondaje',
      },
      {
        key:'topography',name:'Topografía',status:'awaiting_source',cutoff:activeEngineeringPlan.data?.period_end||null,
        facts:[activeEngineeringPlan.data?.plan_code?`Plan activo ${activeEngineeringPlan.data.plan_code}`:'Sin plan mensual activo','No existe todavía fuente canónica de levantamientos, coordenadas, cotas o avance topográfico real'],
        nextAction:'Levantar la fuente topográfica original antes de calcular cumplimiento',
        href:'/dashboard/produccion/topografia',
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
