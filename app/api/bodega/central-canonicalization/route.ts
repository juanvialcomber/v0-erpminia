export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const allowedStates = new Set([
  'review_identity_conflict',
  'review_missing_motil_product',
  'review_negative_source',
  'review_stale_source',
  'review_source_authority',
  'review_fractional_precision',
  'review_existing_central_balance',
  'review_duplicate_unassigned_rows',
  'review_unassigned_balance_or_history',
  'candidate_assign_zero_row',
  'candidate_create_opening_row',
  'already_canonical',
  'zero_no_opening_balance',
]);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const requestedState = request.nextUrl.searchParams.get('state') || 'all';
  if (requestedState !== 'all' && !allowedStates.has(requestedState)) {
    return NextResponse.json({ error: 'Estado de vista previa inválido.' }, { status: 400 });
  }

  const requestedLimit = Number(request.nextUrl.searchParams.get('limit') || 25);
  const requestedOffset = Number(request.nextUrl.searchParams.get('offset') || 0);
  const limit = Number.isFinite(requestedLimit) ? Math.min(100, Math.max(1, Math.trunc(requestedLimit))) : 25;
  const offset = Number.isFinite(requestedOffset) ? Math.max(0, Math.trunc(requestedOffset)) : 0;

  try {
    let rowsQuery = (context.supabase as any)
      .from('bodega_central_stock_canonicalization_preview_v1')
      .select('canonical_product_id,sku,description,unit_of_measure,source_quantity,source_position_count,source_identity_count,has_negative_position,has_fractional_position,source_cutoff,source_synced_at,canonicalization_state', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .order('sku', { ascending: true });
    if (requestedState !== 'all') rowsQuery = rowsQuery.eq('canonicalization_state', requestedState);

    const [summaryResult, rowsResult] = await Promise.all([
      (context.supabase as any)
        .from('bodega_central_stock_canonicalization_summary_v1')
        .select('warehouse_id,source_cutoff,source_synced_at,authority_state,products_reviewed,existing_zero_rows_to_assign,opening_rows_to_create,already_canonical,requires_review,identity_conflicts,negative_source_products,fractional_products,stale_source_products,zero_without_opening_balance')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      rowsQuery.range(offset, offset + limit - 1),
    ]);

    if (summaryResult.error) throw summaryResult.error;
    if (rowsResult.error) throw rowsResult.error;

    return NextResponse.json({
      summary: summaryResult.data || null,
      rows: rowsResult.data || [],
      count: rowsResult.count || 0,
      limit,
      offset,
      readOnly: true,
      applied: false,
    });
  } catch (error) {
    console.error('[bodega/central-canonicalization][GET]', error);
    return NextResponse.json({ error: 'No fue posible preparar la vista previa de canonización.' }, { status: 500 });
  }
}
