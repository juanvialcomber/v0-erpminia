export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';
import { recoverMissingPurchaseInvoices } from '@/lib/integrations/laudus/procurement-sync';

const RUN_KEY = 'laudus:missing_invoice_recovery_once:20261107_a';

function cronAuthorized(request: NextRequest) {
  const expected = process.env.CRON_SECRET || '';
  const authorization = request.headers.get('authorization') || '';
  if (!expected || expected.length < 24 || !authorization.startsWith('Bearer ')) return false;
  const provided = authorization.slice(7);
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a,b);
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) return NextResponse.json({error:'No autorizado'},{status:401});

  const db = getSupabaseServerClient();
  const { data: existing } = await db
    .from('data_reconciliation_reviews')
    .select('id,status')
    .eq('issue_key', RUN_KEY)
    .maybeSingle();

  if (existing) {
    return NextResponse.json({ok:true, skipped:true, reason:'already_executed'});
  }

  const { data: candidateRows, error: candidateError } = await db
    .from('laudus_missing_purchase_invoice_recovery_candidates_v1')
    .select('organization_id')
    .order('recovery_priority',{ascending:true})
    .limit(500);
  if (candidateError) return NextResponse.json({error:'No se pudo leer cola de recuperación.'},{status:503});

  const orgs=[...new Set((candidateRows||[]).map((r:any)=>String(r.organization_id||'')).filter(Boolean))];
  if (orgs.length!==1) return NextResponse.json({error:'La corrida requiere una única organización candidata.'},{status:409});
  const organizationId=orgs[0];

  const { error: markerError } = await db.from('data_reconciliation_reviews').insert({
    organization_id: organizationId,
    issue_key: RUN_KEY,
    entity_type: 'external_source',
    issue_type: 'recuperacion_facturas_laudus',
    field_name: 'facturas',
    status: 'open',
    evidence_reference: 'Corrida única controlada: máximo 12 facturas; sin escritura en Laudus ni mutación canónica MOTIL.'
  });
  if (markerError) {
    return NextResponse.json({ok:true, skipped:true, reason:'marker_exists_or_unavailable'});
  }

  try {
    const result = await withLaudusApiUsageTracking(
      organizationId,
      () => recoverMissingPurchaseInvoices(organizationId, db),
    );

    await db.from('data_reconciliation_reviews')
      .update({
        status:'resolved',
        resolution_note:`Corrida completada: recuperadas=${Number(result.recuperadas||0)}, errores=${Number(result.errores||0)}, llamadas_api=${Number(result.apiCalls||0)}.`,
        reviewed_at:new Date().toISOString(),
        updated_at:new Date().toISOString(),
      })
      .eq('organization_id',organizationId)
      .eq('issue_key',RUN_KEY);

    return NextResponse.json({ok:true,result});
  } catch (error) {
    await db.from('data_reconciliation_reviews')
      .update({
        resolution_note:'La corrida falló; requiere revisión antes de reintentar.',
        updated_at:new Date().toISOString(),
      })
      .eq('organization_id',organizationId)
      .eq('issue_key',RUN_KEY);
    return NextResponse.json({error:'Falló la recuperación controlada.'},{status:500});
  }
}
