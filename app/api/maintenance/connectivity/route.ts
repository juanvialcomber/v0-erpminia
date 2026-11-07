export const dynamic='force-dynamic';

import {NextRequest,NextResponse} from 'next/server';
import {getOrganizationContext} from '@/lib/api/organization-context';
import {MODULE_KEYS,requireModuleAccess} from '@/lib/api/module-access';

type Health='healthy'|'degraded'|'attention'|'unknown';
const count=async(query:PromiseLike<{count:number|null;error:{message:string}|null}>)=>{
  const result=await query;
  if(result.error)throw new Error(result.error.message);
  return result.count??0;
};

export async function GET(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.MANT_OPERACIONES);
  if(!access.authorized)return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok)return context.response;
  const db=context.supabase;
  try{
    const [
      laudusStatus,
      stockAuthority,
      stockRecon,
      whatsappGroups,
      whatsappLatest,
      whatsappDaily,
      whatsappWaitingScan,
      whatsappTerminalDownload,
      emailPendingMirror,
      emailStaged,
      productionSource,
    ]=await Promise.all([
      db.from('laudus_source_status_service_v1').select('enabled,latest_status,latest_run_at')
        .eq('organization_id',context.organizationId).maybeSingle(),
      db.from('bodega_stock_source_authority_service_v1').select('*')
        .eq('organization_id',context.organizationId).maybeSingle(),
      db.from('laudus_inventory_reconciliation_summary_service_v1').select('*')
        .eq('organization_id',context.organizationId).maybeSingle(),
      db.from('motil_whatsapp_groups').select('display_name,enabled,last_received_at')
        .eq('organization_id',context.organizationId).order('display_name'),
      db.from('motil_whatsapp_messages').select('received_at')
        .eq('organization_id',context.organizationId).order('received_at',{ascending:false}).limit(1).maybeSingle(),
      db.from('motil_whatsapp_daily_reports').select('report_date,status,message_count,error_code,generated_at')
        .eq('organization_id',context.organizationId).order('report_date',{ascending:false}).limit(1).maybeSingle(),
      count(db.from('motil_whatsapp_attachments').select('id',{count:'exact',head:true})
        .eq('organization_id',context.organizationId).eq('download_status','stored').in('scan_status',['pending','retry','processing','waiting'])),
      count(db.from('motil_whatsapp_attachments').select('id',{count:'exact',head:true})
        .eq('organization_id',context.organizationId).in('download_status',['unavailable','unsupported']).eq('scan_status','waiting')),
      count(db.from('motil_email_source_manifest').select('id',{count:'exact',head:true})
        .eq('organization_id',context.organizationId).eq('download_state','pending')),
      count(db.from('motil_email_source_manifest').select('id',{count:'exact',head:true})
        .eq('organization_id',context.organizationId).eq('ingest_state','staged')),
      db.from('production_source_documents').select('source_file,period_end,created_at')
        .eq('organization_id',context.organizationId).eq('canonical_role','canonical')
        .order('period_end',{ascending:false}).limit(1).maybeSingle(),
    ]);

    for(const result of [laudusStatus,stockAuthority,stockRecon,whatsappGroups,whatsappLatest,whatsappDaily,productionSource]){
      if(result.error)throw result.error;
    }

    const laudus=laudusStatus.data;
    const authority=stockAuthority.data;
    const recon=stockRecon.data;
    const latestWhatsApp=whatsappLatest.data?.received_at||null;
    const whatsappReport=whatsappDaily.data;
    const enabledGroups=(whatsappGroups.data||[]).filter(row=>row.enabled);
    const enabledWithoutRecent=enabledGroups.filter(row=>{
      if(!row.last_received_at)return true;
      return Date.now()-new Date(row.last_received_at).getTime()>36*60*60*1000;
    }).map(row=>row.display_name);

    const connections:Array<{
      key:string;name:string;health:Health;freshness:string|null;facts:string[];action:string;href:string;
    }>=[
      {
        key:'laudus',name:'Laudus ERP',
        health:laudus?.enabled&&laudus.latest_status==='completed'?'healthy':'attention',
        freshness:laudus?.latest_run_at||null,
        facts:[
          authority?.authority_state==='laudus_primary'?'Fuente primaria de stock':'Autoridad de stock no confirmada',
          `${Number(recon?.quantity_mismatches||0)} diferencias de cantidad · ${Number(recon?.missing_in_motil_nonzero||0)} SKU Laudus con stock sin contraparte MOTIL`,
          `${Number(recon?.laudus_negative_products||0)} saldos negativos Laudus`,
        ],
        action:Number(recon?.quantity_mismatches||0)>0?'Conciliar diferencias; no sobrescribir stock silenciosamente':'Mantener sincronización y reconciliación',
        href:'/dashboard/bodega',
      },
      {
        key:'whatsapp',name:'WhatsApp / Green API',
        health:latestWhatsApp&&enabledWithoutRecent.length===0&&whatsappReport?.status==='ready'?'healthy':'degraded',
        freshness:latestWhatsApp,
        facts:[
          `${enabledGroups.length} grupos habilitados`,
          whatsappReport?`Reporte ${whatsappReport.report_date}: ${whatsappReport.status} · ${whatsappReport.message_count} mensajes`:'Sin reporte diario reciente',
          `${whatsappWaitingScan} adjuntos almacenados esperando visión · ${whatsappTerminalDownload} estados terminales requieren limpieza de cola`,
        ],
        action:whatsappTerminalDownload>0?'Cerrar estados de visión imposibles y mantener sólo evidencia procesable en cola':'Revisar evidencia pendiente de clasificación',
        href:'/dashboard/mensajes',
      },
      {
        key:'email',name:'Gmail / Adjuntos',
        health:emailPendingMirror>0?'degraded':'healthy',
        freshness:null,
        facts:[
          `${emailPendingMirror} adjuntos con espejo de almacenamiento pendiente`,
          `${emailStaged} fuentes ya llevadas a staging`,
          'El original de Gmail se conserva como evidencia; importación canónica y espejo de archivo son estados distintos.',
        ],
        action:emailPendingMirror>0?'Completar espejo de adjuntos sin duplicar fuentes ya importadas':'Mantener intake y deduplicación por identidad/SHA',
        href:'/dashboard/mantenimiento/areas',
      },
      {
        key:'production-source',name:'Producción / Fuentes',
        health:productionSource.data?.period_end?'healthy':'unknown',
        freshness:productionSource.data?.period_end||null,
        facts:[productionSource.data?.source_file||'Sin fuente canónica reciente'],
        action:'Mantener corte fuente reciente separado del detalle histórico y reconciliar nuevas versiones.',
        href:'/dashboard/produccion/fuentes',
      },
    ];

    return NextResponse.json({
      connections,
      generatedAt:new Date().toISOString(),
      note:'Salud de conectividad basada en ejecución, frescura y conciliación. Un HTTP 200 sin avance canónico no se considera suficiente.',
    },{headers:{'Cache-Control':'private, no-store'}});
  }catch(error){
    return NextResponse.json({error:error instanceof Error?error.message:'No se pudo construir la salud de conectividad'},{status:500});
  }
}
