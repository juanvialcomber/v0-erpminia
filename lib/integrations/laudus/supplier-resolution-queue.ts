import type { SupabaseClient } from '@supabase/supabase-js';

export async function loadSupplierResolutionQueue(
  db: SupabaseClient,
  organizationId: string,
  limit = 20,
) {
  const [countResult, rowsResult] = await Promise.all([
    db
      .schema('integration')
      .from('supplier_resolution_queue_v1')
      .select('supplier_name_key', { count: 'exact', head: true })
      .eq('organization_id', organizationId),
    db
      .schema('integration')
      .from('supplier_resolution_queue_v1')
      .select(
        'supplier_name_key,display_name,purchase_order_count,first_order_date,last_order_date,currency_count,single_currency,total_amount_single_currency',
      )
      .eq('organization_id', organizationId)
      .order('purchase_order_count', { ascending: false })
      .limit(Math.min(Math.max(limit, 1), 100)),
  ]);

  if (countResult.error) throw new Error(countResult.error.message);
  if (rowsResult.error) throw new Error(rowsResult.error.message);

  return {
    unresolvedNames: countResult.count ?? 0,
    rows: rowsResult.data || [],
  };
}
