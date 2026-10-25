export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const query = request.nextUrl.searchParams.get('q')?.trim() || '';
    const status = request.nextUrl.searchParams.get('status')?.trim() || '';
    const intelligence = context.supabase.schema('intelligence');

    let centersQuery = intelligence
      .from('cost_center_financials')
      .select('*')
      .eq('organization_id', context.organizationId)
      .order('operational_cost', { ascending: false })
      .limit(300);

    if (status && status !== 'all') centersQuery = centersQuery.eq('financial_status', status);
    if (query) centersQuery = centersQuery.or(`cost_center_code.ilike.%${query}%,name.ilike.%${query}%,full_path.ilike.%${query}%`);

    const [overviewResult, centersResult] = await Promise.all([
      intelligence.from('finance_overview').select('*').eq('organization_id', context.organizationId).maybeSingle(),
      centersQuery,
    ]);

    const error = overviewResult.error || centersResult.error;
    if (error) throw error;

    return NextResponse.json({
      overview: overviewResult.data || null,
      costCenters: centersResult.data || [],
      source: 'intelligence.cost_center_financials',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la inteligencia financiera';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
