export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const ACTIONABLE = ['unknown_code', 'multi_line_review', 'unresolved'] as const;
const MAX_ROWS = 50;

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [unknownCount, multiReviewCount, unresolvedCount, rowsResult] = await Promise.all([
      context.supabase.from('purchase_order_reconciliation_preview_service_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('cost_center_resolution_status', 'unknown_code'),
      context.supabase.from('purchase_order_reconciliation_preview_service_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('cost_center_resolution_status', 'multi_line_review'),
      context.supabase.from('purchase_order_reconciliation_preview_service_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('cost_center_resolution_status', 'unresolved'),
      context.supabase
        .from('purchase_order_reconciliation_preview_service_v1')
        .select('purchase_order_id,order_number,order_date,supplier_name,cost_center_resolution_status,raw_line_cost_center,parsed_line_cost_center_code,distinct_line_cost_centers,total_amount,currency')
        .eq('organization_id', context.organizationId)
        .in('cost_center_resolution_status', [...ACTIONABLE])
        .order('order_date', { ascending: false })
        .limit(MAX_ROWS),
    ]);

    const error = unknownCount.error || multiReviewCount.error || unresolvedCount.error || rowsResult.error;
    if (error) throw error;

    return NextResponse.json({
      summary: {
        unknownCode: unknownCount.count || 0,
        multiLineReview: multiReviewCount.count || 0,
        unresolved: unresolvedCount.count || 0,
        actionable: (unknownCount.count || 0) + (multiReviewCount.count || 0) + (unresolvedCount.count || 0),
      },
      rows: rowsResult.data || [],
      readOnly: true,
      policy: 'review_only',
      semantics: {
        multiLineAllocationIsNotConflict: true,
        sourcePlaceholderIsNotActionable: true,
        canonicalMutationExecuted: false,
      },
    });
  } catch (error) {
    console.error('[procurement/cost-center-review]', error);
    return NextResponse.json({ error: 'No fue posible cargar la revisión histórica de centros de costo.' }, { status: 500 });
  }
}
