import type { SupabaseClient } from '@supabase/supabase-js';

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

function pct(part: number, total: number) {
  if (!total) return 0;
  return Math.round((part / total) * 1000) / 10;
}

export async function loadLaudusAccountingReadiness(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    ledgerRows,
    committedRows,
    recognizedRows,
    withCostCenter,
    withProduct,
    withAsset,
    withSupplier,
    withWorkOrder,
    withAmount,
    clpRows,
    canonicalCostCenters,
    financeCostCenters,
    canonicalAssets,
    financeAssets,
    exactFinanceAssets,
    assetsWithAcquisitionDate,
    assetsWithAcquisitionCost,
    assetsWithExpectedLifespan,
  ] = await Promise.all([
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('event_type', 'purchase_commitment')),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('event_type', 'actual_cost')),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('cost_center_code', 'is', null).neq('cost_center_code', '')),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_product_id', 'is', null)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_asset_id', 'is', null)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('supplier_id', 'is', null)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('work_order_id', 'is', null)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('amount', 'is', null)),
    count(db.from('canonical_clp_cost_ledger').select('event_id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('currency', 'CLP')),
    count(db.schema('canonical').from('cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_finance_cost_centers').select('cost_center_code', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('canonical_finance_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('finance_asset_reconciliation_v1').select('finance_asset_id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reconciliation_status', 'resolved_exact')),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('acquisition_date', 'is', null)),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('acquisition_cost', 'is', null)),
    count(db.schema('canonical').from('assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('expected_lifespan_years', 'is', null)),
  ]);

  let laudusState: 'waiting_laudus' | 'ready_to_compare' | 'review' = 'waiting_laudus';

  try {
    const source = await db
      .schema('integration')
      .from('external_sources')
      .select('id,enabled')
      .eq('organization_id', organizationId)
      .eq('source_key', 'laudus')
      .maybeSingle();

    if (!source.error && source.data?.enabled) {
      const run = await db
        .schema('integration')
        .from('sync_runs')
        .select('status')
        .eq('organization_id', organizationId)
        .eq('source_id', source.data.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      const status = String(run.data?.status || '').toLowerCase();
      if (status === 'completed') laudusState = 'ready_to_compare';
      if (status === 'partial' || status === 'failed') laudusState = 'review';
    }
  } catch {
    // Expected before the private integration schema is deployed.
  }

  return {
    ledger: {
      total: ledgerRows,
      committed: committedRows,
      recognized: recognizedRows,
      costCenterCoverage: pct(withCostCenter, ledgerRows),
      productCoverage: pct(withProduct, ledgerRows),
      assetCoverage: pct(withAsset, ledgerRows),
      supplierCoverage: pct(withSupplier, ledgerRows),
      workOrderCoverage: pct(withWorkOrder, ledgerRows),
      amountCoverage: pct(withAmount, ledgerRows),
      clpCoverage: pct(clpRows, ledgerRows),
    },
    costCenters: {
      canonical: canonicalCostCenters,
      usedByFinance: financeCostCenters,
      financeUsageCoverage: pct(financeCostCenters, canonicalCostCenters),
    },
    assets: {
      canonical: canonicalAssets,
      finance: financeAssets,
      exactFinanceMatches: exactFinanceAssets,
      exactFinanceMatchCoverage: pct(exactFinanceAssets, financeAssets),
      acquisitionDateCoverage: pct(assetsWithAcquisitionDate, canonicalAssets),
      acquisitionCostCoverage: pct(assetsWithAcquisitionCost, canonicalAssets),
      expectedLifespanCoverage: pct(assetsWithExpectedLifespan, canonicalAssets),
    },
    reconciliation: {
      state: laudusState,
      autoPostAccountingEntries: false,
      autoRewriteLedger: false,
      autoMergeAssets: false,
      humanReviewRequired: true,
    },
    policy: {
      laudusAccountingRole: 'financial_source',
      laudusFixedAssetRole: 'financial_source',
      motilLedgerRole: 'operational_financial_ledger',
      motilAssetRole: 'operational_asset_authority',
      commitmentsRemainDistinctFromRecognizedCosts: true,
    },
  };
}
