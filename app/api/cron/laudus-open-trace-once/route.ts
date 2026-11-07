export const dynamic = 'force-dynamic';

import { timingSafeEqual } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { requireAdmin } from '@/lib/api/guard';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { recoverOpenInvoiceTraces } from '@/lib/integrations/laudus/native-invoice-trace';

const RUN_KEY='laudus:open_invoice_trace_once:20261107_b';

function authorized(request: NextRequest) {
  const expected=process.env.CRON_SECRET || '';
  const auth=request.headers.get('authorization') || '';
  if (!expected || expected.length<24 || !auth.startsWith('Bearer ')) return false;
  const a=Buffer.from(expected);
  const b=Buffer.from(auth.slice(7));
  return a.length===b.length && timingSafeEqual(a,b);
}

export async function GET(request: NextRequest) {
  const cronAuthorized=authorized(request);
  const adminAuth=cronAuthorized ? null : await requireAdmin(request);
  if (!cronAuthorized && (!adminAuth?.authorized || !adminAuth.organizationId)) {
    return adminAuth?.response || NextResponse.json({error:'No autorizado'},{status:401});
  }

  const db=getSupabaseServerClient();

  const {data: existing}=await db.from('data_reconciliation_reviews')
    .select('id,status,resolution_note').eq('issue_key',RUN_KEY).maybeSingle();
  if (existing) return NextResponse.json({ok:true,skipped:true,reason:'already_executed',status:existing.status});

  let organizationId=adminAuth?.organizationId ? String(adminAuth.organizationId) : '';
  if (!organizationId) {
    const {data: orgRows,error: orgError}=await db.from('laudus_source_status_service_v1')
      .select('organization_id').eq('enabled',true).limit(10);
    if (orgError) return NextResponse.json({error:'No se pudo resolver organización Laudus.'},{status:503});
    const orgs=[...new Set((orgRows||[]).map((r:any)=>String(r.organization_id||'')).filter(Boolean))];
    if (orgs.length!==1) return NextResponse.json({error:'La corrida requiere una única organización Laudus habilitada.'},{status:409});
    organizationId=orgs[0];
  }

  const {error: markerError}=await db.from('data_reconciliation_reviews').insert({
    organization_id:organizationId,
    issue_key:RUN_KEY,
    entity_type:'external_source',
    issue_type:'recuperacion_trazabilidad_facturas_laudus',
    field_name:'facturas',
    status:'open',
    evidence_reference:'Corrida única: máximo 12 facturas; staging solamente; sin escritura en Laudus ni mutación canónica MOTIL.'
  });
  if (markerError) return NextResponse.json({ok:true,skipped:true,reason:'marker_exists_or_unavailable'});

  try {
    const result=await withLaudusApiUsageTracking(
      organizationId,
      ()=>recoverOpenInvoiceTraces(db,organizationId),
    );
    await db.from('data_reconciliation_reviews').update({
      status:'resolved',
      resolution_note:`Corrida completada: recuperadas=${Number(result.recuperadas||0)}, trazas=${Number(result.trazasPersistidas||0)}, errores=${Number(result.errores||0)}, llamadas_api=${Number(result.apiCalls||0)}.`,
      reviewed_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('issue_key',RUN_KEY);
    return NextResponse.json({ok:true,result});
  } catch (error) {
    await db.from('data_reconciliation_reviews').update({
      resolution_note:'La corrida falló; requiere revisión antes de reintentar.',
      updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('issue_key',RUN_KEY);
    return NextResponse.json({error:'Falló la recuperación controlada de trazabilidad.'},{status:500});
  }
}
