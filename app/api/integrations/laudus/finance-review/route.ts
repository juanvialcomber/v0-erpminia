export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 50);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 50, 1), 100);

  const { data, error } = await context.supabase.rpc('motil_laudus_finance_review_queue', {
    p_organization_id: context.organizationId,
    p_limit: limit,
  });

  if (error) {
    console.error('[finance/laudus-review]', error.message);
    return NextResponse.json({ error: 'No se pudo cargar la revisión financiera Laudus.' }, { status: 500 });
  }

  return NextResponse.json(data || {
    source: 'Laudus',
    read_only: true,
    summary: {},
    trace_coverage: {},
    reviews: [],
    supplier_exposure: [],
    canonical_mutated: false,
    laudus_mutated: false,
  });
}
