import type { SupabaseClient } from '@supabase/supabase-js';

const RECONCILIATION_VIEW = 'purchase_order_reconciliation_preview_service_v1';

export type ProcurementReconciliationSummary = {
  total: number;
  supplier: {
    alreadyLinked: number;
    exactUniqueCandidates: number;
    conflicts: number;
    unresolved: number;
  };
  costCenter: {
    alreadyLinked: number;
    consensusCandidates: number;
    conflicts: number;
    unknownCode: number;
    unresolved: number;
  };
  fullyResolvable: number;
};

export async function loadProcurementReconciliationSummary(
  db: SupabaseClient,
  organizationId: string,
): Promise<ProcurementReconciliationSummary> {
  const base = db
    .from(RECONCILIATION_VIEW)
    .select('purchase_order_id', { count: 'exact', head: true })
    .eq('organization_id', organizationId);

  const countWhere = async (column: string, value: string) => {
    const result = await db
      .from(RECONCILIATION_VIEW)
      .select('purchase_order_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq(column, value);
    if (result.error) throw new Error(result.error.message);
    return result.count ?? 0;
  };

  const totalResult = await base;
  if (totalResult.error) throw new Error(totalResult.error.message);

  const [
    supplierAlready,
    supplierExact,
    supplierConflicts,
    supplierUnresolved,
    ccAlready,
    ccConsensus,
    ccConflicts,
    ccUnknownCode,
    ccUnresolved,
    fullyResolvableResult,
  ] = await Promise.all([
    countWhere('supplier_resolution_status', 'already_linked'),
    countWhere('supplier_resolution_status', 'exact_unique_name'),
    countWhere('supplier_resolution_status', 'conflict'),
    countWhere('supplier_resolution_status', 'unresolved'),
    countWhere('cost_center_resolution_status', 'already_linked'),
    countWhere('cost_center_resolution_status', 'line_consensus'),
    countWhere('cost_center_resolution_status', 'conflict'),
    countWhere('cost_center_resolution_status', 'unknown_code'),
    countWhere('cost_center_resolution_status', 'unresolved'),
    db
      .from(RECONCILIATION_VIEW)
      .select('purchase_order_id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('fully_resolvable', true),
  ]);

  if (fullyResolvableResult.error) throw new Error(fullyResolvableResult.error.message);

  return {
    total: totalResult.count ?? 0,
    supplier: {
      alreadyLinked: supplierAlready,
      exactUniqueCandidates: supplierExact,
      conflicts: supplierConflicts,
      unresolved: supplierUnresolved,
    },
    costCenter: {
      alreadyLinked: ccAlready,
      consensusCandidates: ccConsensus,
      conflicts: ccConflicts,
      unknownCode: ccUnknownCode,
      unresolved: ccUnresolved,
    },
    fullyResolvable: fullyResolvableResult.count ?? 0,
  };
}

export async function loadProcurementReconciliationExceptions(
  db: SupabaseClient,
  organizationId: string,
  limit = 100,
) {
  const result = await db
    .from(RECONCILIATION_VIEW)
    .select(
      'purchase_order_id,order_number,order_date,supplier_name,supplier_resolution_status,cost_center_resolution_status,raw_line_cost_center,parsed_line_cost_center_code,distinct_line_cost_centers,total_amount,currency',
    )
    .eq('organization_id', organizationId)
    .or('supplier_resolution_status.in.(conflict,unresolved),cost_center_resolution_status.in.(conflict,unknown_code)')
    .order('order_date', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (result.error) throw new Error(result.error.message);
  return result.data || [];
}
