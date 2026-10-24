import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadSupplierResolutionQueue(
  db: SupabaseClient,
  organizationId: string,
  limit = 20,
) {
  const base = db
    .from('laudus_supplier_bridge_candidates_service_v1')
    .select('supplier_name_key', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  const countStatus = async (status: string) => {
    const result = await db
      .from('laudus_supplier_bridge_candidates_service_v1')
      .select('supplier_name_key', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('resolution_status', status);
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  };

  const sumOrders = async (status: string) => {
    const result = await db
      .from('laudus_supplier_bridge_candidates_service_v1')
      .select('purchase_order_count')
      .eq('organization_id', organizationId)
      .eq('resolution_status', status);
    if (result.error) throw new Error(result.error.message);
    return (result.data || []).reduce(
      (sum, row) => sum + Number(row.purchase_order_count || 0),
      0,
    );
  };

  const [
    totalResult,
    verifiedNames,
    placeholderNames,
    unresolvedNames,
    ambiguousNames,
    verifiedOrders,
    placeholderOrders,
    rowsResult,
  ] = await Promise.all([
    base,
    countStatus('tax_verified_exact'),
    countStatus('source_placeholder'),
    countStatus('unresolved'),
    countStatus('ambiguous'),
    sumOrders('tax_verified_exact'),
    sumOrders('source_placeholder'),
    db
      .from('laudus_supplier_bridge_candidates_service_v1')
      .select(
        'supplier_name_key,display_name,purchase_order_count,first_order_date,last_order_date,proposed_canonical_supplier_name,proposed_canonical_supplier_tax_id,resolution_status,resolution_method,evaluated_at',
      )
      .eq('organization_id', organizationId)
      .order('purchase_order_count', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100)),
  ]);

  if (totalResult.error) throw new Error(totalResult.error.message);
  if (rowsResult.error) throw new Error(rowsResult.error.message);

  return {
    totalNames: totalResult.count ?? 0,
    verifiedNames,
    placeholderNames,
    unresolvedNames,
    ambiguousNames,
    verifiedOrders,
    placeholderOrders,
    rows: rowsResult.data || [],
    method: 'exact_name_to_laudus_plus_exact_tax_id_to_canonical',
    canonicalMutated: false,
  };
}
