export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { refreshRecentPurchaseInvoiceMetadata } from '@/lib/integrations/laudus/procurement-sync';

const RUN_KEY='laudus:recent_invoice_metadata_once:20261107_a';

export async function GET(request: NextRequest) {
  const auth=await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) return auth.response;

  const db=getSupabaseServerClient();
  const organizationId=String(auth.organizationId);

  const {data: existing}=await db.from('data_reconciliation_reviews')
    .select('id,status,resolution_note').eq('organization_id',organizationId).eq('issue_key',RUN_KEY).maybeSingle();
  if (existing) {
    return NextResponse.json({ok:true,skipped:true,reason:'already_executed',status:existing.status});
  }

  const {error: markerError}=await db.from('data_reconciliation_reviews').insert({
    organization_id:organizationId,
    issue_key:RUN_KEY,
    entity_type:'external_source',
    issue_type:'refresh_metadatos_facturas_laudus',
    field_name:'proveedor',
    status:'open',
    evidence_reference:'Refresh único de máximo 200 facturas recientes; cabecera solamente; líneas preservadas; sin escritura en Laudus ni canónico.'
  });
  if (markerError) {
    return NextResponse.json({ok:true,skipped:true,reason:'marker_exists_or_unavailable'});
  }

  try {
    const result=await withLaudusApiUsageTracking(
      organizationId,
      ()=>refreshRecentPurchaseInvoiceMetadata(organizationId,db),
    );

    await db.from('data_reconciliation_reviews').update({
      status:'resolved',
      resolution_note:`Refresh completado: leídas=${Number(result.facturasLeidas||0)}, actualizadas=${Number(result.facturasActualizadas||0)}, llamadas_api=${Number(result.apiCalls||0)}.`,
      reviewed_at:new Date().toISOString(),
      updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('issue_key',RUN_KEY);

    return NextResponse.json({ok:true,result});
  } catch (error) {
    await db.from('data_reconciliation_reviews').update({
      resolution_note:'Refresh falló; requiere revisión antes de reintentar.',
      updated_at:new Date().toISOString(),
    }).eq('organization_id',organizationId).eq('issue_key',RUN_KEY);
    return NextResponse.json({error:'No fue posible refrescar los metadatos de facturas.'},{status:500});
  }
}
