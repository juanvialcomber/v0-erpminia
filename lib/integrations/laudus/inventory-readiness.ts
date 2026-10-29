import type { SupabaseClient } from '@supabase/supabase-js';

type CountResult = { count: number | null; error: { message: string } | null };

type LaudusReadinessRow = {
  enabled: boolean | null;
  latest_run_status: string | null;
  products: number | string | null;
  eligible_products: number | string | null;
  linked_eligible_products: number | string | null;
  stock_rows: number | string | null;
  latest_stock_sync: string | null;
  warehouses: number | string | null;
  physical_warehouses: number | string | null;
  mapped_physical_warehouses: number | string | null;
  open_reconciliation: number | string | null;
};

type BodegaAuthorityRow = {
  authority_state: string | null;
  authority_reason: string | null;
  latest_laudus_stock_sync: string | null;
  latest_laudus_stock_date: string | null;
  latest_email_stock_cutoff: string | null;
  latest_email_pending_reconciliation: number | string | null;
  latest_whatsapp_stock_evidence: string | null;
  whatsapp_stock_evidence_since_laudus: number | string | null;
};

type LaudusReconciliationSummaryRow = {
  compared_products: number | string | null;
  aligned_products: number | string | null;
  quantity_mismatches: number | string | null;
  missing_in_motil_nonzero: number | string | null;
  laudus_only_zero: number | string | null;
  laudus_negative_products: number | string | null;
  latest_laudus_stock_sync: string | null;
  latest_motil_stock_update: string | null;
};

async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

function n(value: number | string | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOlderThanHours(value: string | null | undefined, hours: number) {
  if (!value) return true;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return true;
  return Date.now() - timestamp > hours * 60 * 60 * 1000;
}

export async function loadLaudusInventoryReadiness(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    stockRows,
    stockProductLinks,
    stockWithCountDate,
    movements,
    snapshotRows,
    snapshotWarehouse,
    overviewResult,
    latestSnapshot,
    readinessResult,
    reconciliationSummaryResult,
    authorityResult,
  ] = await Promise.all([
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_product_id', 'is', null)),
    count(db.from('warehouse_stock').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('last_counted_date', 'is', null)),
    count(db.from('stock_movements').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_inventory_current').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_inventory_current').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('warehouse_code', 'is', null).neq('warehouse_code', '')),
    db
      .from('inventory_intelligence_overview_v1')
      .select('negative_stock_products')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db
      .from('canonical_inventory_current')
      .select('snapshot_date')
      .eq('organization_id', organizationId)
      .not('snapshot_date', 'is', null)
      .order('snapshot_date', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('laudus_inventory_readiness_service_v1')
      .select('enabled,latest_run_status,products,eligible_products,linked_eligible_products,stock_rows,latest_stock_sync,warehouses,physical_warehouses,mapped_physical_warehouses,open_reconciliation')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db
      .from('laudus_inventory_reconciliation_summary_service_v1')
      .select('compared_products,aligned_products,quantity_mismatches,missing_in_motil_nonzero,laudus_only_zero,laudus_negative_products,latest_laudus_stock_sync,latest_motil_stock_update')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    db
      .from('bodega_stock_source_authority_service_v1')
      .select('authority_state,authority_reason,latest_laudus_stock_sync,latest_laudus_stock_date,latest_email_stock_cutoff,latest_email_pending_reconciliation,latest_whatsapp_stock_evidence,whatsapp_stock_evidence_since_laudus')
      .eq('organization_id', organizationId)
      .maybeSingle(),
  ]);

  if (overviewResult.error) throw new Error(overviewResult.error.message);
  if (latestSnapshot.error) throw new Error(latestSnapshot.error.message);
  if (readinessResult.error) throw new Error(readinessResult.error.message);
  if (reconciliationSummaryResult.error) throw new Error(reconciliationSummaryResult.error.message);
  if (authorityResult.error) throw new Error(authorityResult.error.message);

  const readiness = (readinessResult.data || null) as LaudusReadinessRow | null;
  const reconciliationSummary = (reconciliationSummaryResult.data || null) as LaudusReconciliationSummaryRow | null;
  const authority = (authorityResult.data || null) as BodegaAuthorityRow | null;

  const laudusProducts = n(readiness?.products);
  const laudusEligibleProducts = n(readiness?.eligible_products);
  const laudusEligibleProductsLinked = n(readiness?.linked_eligible_products);
  const laudusStockRows = n(readiness?.stock_rows);
  const openReconciliation = n(readiness?.open_reconciliation);
  const quantityMismatches = n(reconciliationSummary?.quantity_mismatches);
  const missingInMotilNonzero = n(reconciliationSummary?.missing_in_motil_nonzero);
  const laudusNegativeProducts = n(reconciliationSummary?.laudus_negative_products);
  const latestStockSync = readiness?.latest_stock_sync || reconciliationSummary?.latest_laudus_stock_sync || null;
  const stockIsStale = isOlderThanHours(latestStockSync, 8);
  const authorityState = authority?.authority_state || (stockIsStale ? 'review_laudus_stale' : 'review_laudus_unavailable');
  const laudusIsPrimary = authorityState === 'laudus_primary';

  let laudusState: 'waiting_laudus' | 'ready_to_compare' | 'review' = 'waiting_laudus';
  const latestRunStatus = String(readiness?.latest_run_status || '').toLowerCase();

  if (readiness?.enabled && laudusStockRows > 0) {
    laudusState = (
      latestRunStatus === 'partial' ||
      latestRunStatus === 'failed' ||
      openReconciliation > 0 ||
      laudusNegativeProducts > 0 ||
      !laudusIsPrimary
    ) ? 'review' : 'ready_to_compare';
  }

  return {
    stock: {
      rows: stockRows,
      productCoverage: pct(stockProductLinks, stockRows),
      physicalCountCoverage: pct(stockWithCountDate, stockRows),
    },
    snapshot: {
      rows: snapshotRows,
      warehouseCoverage: pct(snapshotWarehouse, snapshotRows),
      latestDate: latestSnapshot.data?.snapshot_date || null,
      negativeRows: n(overviewResult.data?.negative_stock_products),
    },
    movementCount: movements,
    laudus: {
      products: laudusProducts,
      eligibleProducts: laudusEligibleProducts,
      excludedProducts: Math.max(0, laudusProducts - laudusEligibleProducts),
      canonicalProductCoverage: pct(laudusEligibleProductsLinked, laudusEligibleProducts),
      stockRows: laudusStockRows,
      warehouses: n(readiness?.warehouses),
      physicalWarehouses: n(readiness?.physical_warehouses),
      mappedPhysicalWarehouses: n(readiness?.mapped_physical_warehouses),
      latestStockSync,
      latestMotilStockUpdate: reconciliationSummary?.latest_motil_stock_update || null,
      stockIsStale,
      openReconciliation,
      comparedProducts: n(reconciliationSummary?.compared_products),
      alignedProducts: n(reconciliationSummary?.aligned_products),
      quantityMismatches,
      missingInMotilNonzero,
      laudusOnlyZero: n(reconciliationSummary?.laudus_only_zero),
      negativeProducts: laudusNegativeProducts,
    },
    authority: {
      state: authorityState,
      reason: authority?.authority_reason || 'No se pudo verificar la autoridad de la fuente.',
      laudusIsPrimary,
      latestEmailStockCutoff: authority?.latest_email_stock_cutoff || null,
      latestEmailPendingReconciliation: n(authority?.latest_email_pending_reconciliation),
      latestWhatsappStockEvidence: authority?.latest_whatsapp_stock_evidence || null,
      whatsappStockEvidenceSinceLaudus: n(authority?.whatsapp_stock_evidence_since_laudus),
    },
    reconciliation: {
      state: laudusState,
      defaultAbsoluteTolerance: 0,
      requiresApprovedTolerance: true,
      physicalCountUsedAsEvidence: true,
      autoApply: false as const,
    },
    policy: {
      primaryStockSource: laudusIsPrimary ? 'laudus' as const : 'reconciliation' as const,
      laudusStockRole: 'primary_when_consistent' as const,
      motilOperationalStockRole: 'comparison_evidence' as const,
      crossSourceValidation: ['official_email', 'whatsapp'] as const,
      autoOverwrite: false as const,
    },
  };
}
