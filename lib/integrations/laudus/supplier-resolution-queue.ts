import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadSupplierResolutionQueue(
  db: SupabaseClient,
  organizationId: string,
  limit = 20,
) {
  const [summaryResult, rowsResult] = await Promise.all([
    db
      .from('laudus_supplier_bridge_summary_service_v1')
      .select(
        'total_names,verified_names,placeholder_names,unresolved_names,ambiguous_names,verified_orders,placeholder_orders,evaluated_at',
      )
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db
      .from('laudus_supplier_bridge_candidates_service_v1')
      .select(
        'supplier_name_key,display_name,purchase_order_count,first_order_date,last_order_date,proposed_canonical_supplier_name,proposed_canonical_supplier_tax_id,resolution_status,resolution_method,evaluated_at',
      )
      .eq('organization_id', organizationId)
      .order('purchase_order_count', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100)),
  ]);

  if (summaryResult.error) throw new Error(summaryResult.error.message);
  if (rowsResult.error) throw new Error(rowsResult.error.message);

  const summary = summaryResult.data;

  return {
    totalNames: Number(summary?.total_names || 0),
    verifiedNames: Number(summary?.verified_names || 0),
    placeholderNames: Number(summary?.placeholder_names || 0),
    unresolvedNames: Number(summary?.unresolved_names || 0),
    ambiguousNames: Number(summary?.ambiguous_names || 0),
    verifiedOrders: Number(summary?.verified_orders || 0),
    placeholderOrders: Number(summary?.placeholder_orders || 0),
    evaluatedAt: summary?.evaluated_at || null,
    rows: rowsResult.data || [],
    method: 'exact_name_to_laudus_plus_exact_tax_id_to_canonical',
    canonicalMutated: false,
  };
}
