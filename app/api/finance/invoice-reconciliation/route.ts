export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const statuses = new Set(['identity_missing','ambiguous','currency_missing','laudus_only','motil_only','invoice_difference','approval_missing','payment_difference','candidate_consistent']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const status = request.nextUrl.searchParams.get('status');
  const page = Number(request.nextUrl.searchParams.get('page') ?? '1');
  if ((status && !statuses.has(status)) || !Number.isSafeInteger(page) || page < 1 || page > 10000) {
    return NextResponse.json({ error: 'Filtro o página no válidos.' }, { status: 400 });
  }
  // The organization is resolved from the authenticated session, never from query parameters.
  const { data, error } = await context.supabase.rpc('motil_invoice_reconciliation_v1', {
    p_organization_id: context.organizationId,
    p_status: status || null,
    p_offset: (page - 1) * 50,
    p_limit: 50,
  });
  if (error || !data || typeof data !== 'object' || Array.isArray(data)) {
    console.error('[finance/invoice-reconciliation] lookup failed', error?.code);
    return NextResponse.json({ error: 'No se pudo comparar las facturas. Intenta nuevamente.' }, { status: 503 });
  }
  return NextResponse.json(data, { headers: { 'Cache-Control': 'private, no-store' } });
}
