export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const statuses = new Set(['missing_lines','line_conflict','currency_missing','supplier_identity_missing','header_total_missing','unlinked','review_required']);
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const status = request.nextUrl.searchParams.get('status');
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  const headers = { 'Cache-Control': 'private, no-store' };
  if ((status && !statuses.has(status)) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({error:'Filtro inválido'}, {status:400,headers});
  }
  const {data,error} = await context.supabase.rpc('motil_purchase_order_evidence_v1', {
    p_organization_id:context.organizationId,p_status:status || null,p_offset:(page-1)*50,p_limit:50,
  });
  if (error || !data) return NextResponse.json({error:'No se pudo verificar la evidencia de compras'}, {status:503,headers});
  return NextResponse.json(data,{headers});
}
