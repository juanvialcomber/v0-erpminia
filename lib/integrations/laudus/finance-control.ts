import type { SupabaseClient } from '@supabase/supabase-js';

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

async function latestTimestamp(
  db: SupabaseClient,
  table: string,
  organizationId: string,
  field = 'synced_at',
) {
  const result = await db
    .schema('integration')
    .from(table)
    .select(field)
    .eq('organization_id', organizationId)
    .not(field, 'is', null)
    .order(field, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (result.error) throw new Error(result.error.message);
  return result.data?.[field] ? String(result.data[field]) : null;
}

export async function loadLaudusFinanceControl(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    payments,
    depositedPayments,
    pendingDepositPayments,
    creditNotes,
    costCenters,
    resolvedCostCenters,
    discontinuedCostCenters,
    accountingEntries,
    fixedAssets,
    linkedFixedAssets,
    fixedAssetsWithCost,
    fixedAssetsWithDate,
    fixedAssetsWithUsefulLife,
    creditNoteRows,
    latestAccounting,
    latestPaymentsSync,
    latestPayablesSync,
    latestInvoicesSync,
    latestCreditNotesSync,
    latestCostCentersSync,
  ] = await Promise.all([
    count(db.schema('integration').from('laudus_purchase_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_purchase_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('deposited', true)),
    count(db.schema('integration').from('laudus_purchase_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).or('deposited.is.false,deposited.is.null')),
    count(db.schema('integration').from('laudus_credit_notes').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('reconciliation_status', 'resolved_exact')),
    count(db.schema('integration').from('laudus_cost_centers').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).eq('discontinued', true)),
    count(db.schema('integration').from('laudus_accounting_entries').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_fixed_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.schema('integration').from('laudus_fixed_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('canonical_asset_id', 'is', null)),
    count(db.schema('integration').from('laudus_fixed_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('acquisition_cost', 0)),
    count(db.schema('integration').from('laudus_fixed_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('acquisition_date', 'is', null)),
    count(db.schema('integration').from('laudus_fixed_assets').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('useful_life', 0)),
    db.schema('integration').from('laudus_credit_notes').select('total_amount').eq('organization_id', organizationId),
    db.schema('integration').from('laudus_accounting_entries').select('entry_date').eq('organization_id', organizationId).not('entry_date', 'is', null).order('entry_date', { ascending: false }).limit(1).maybeSingle(),
    latestTimestamp(db, 'laudus_purchase_payments', organizationId),
    latestTimestamp(db, 'laudus_accounts_payable', organizationId),
    latestTimestamp(db, 'laudus_purchase_invoices', organizationId),
    latestTimestamp(db, 'laudus_credit_notes', organizationId),
    latestTimestamp(db, 'laudus_cost_centers', organizationId),
  ]);

  if (creditNoteRows.error) throw new Error(creditNoteRows.error.message);
  if (latestAccounting.error) throw new Error(latestAccounting.error.message);

  const creditNoteAmount = (creditNoteRows.data || []).reduce(
    (sum, row) => sum + Number(row.total_amount || 0),
    0,
  );

  const freshCandidates = [
    latestPaymentsSync,
    latestPayablesSync,
    latestInvoicesSync,
    latestCreditNotesSync,
    latestCostCentersSync,
  ].filter(Boolean) as string[];
  const latestOperationalSync = freshCandidates.length
    ? freshCandidates.sort((a, b) => Date.parse(b) - Date.parse(a))[0]
    : null;

  const latestAccountingEntryDate = latestAccounting.data?.entry_date
    ? String(latestAccounting.data.entry_date)
    : null;
  const accountingAgeDays = latestAccountingEntryDate
    ? Math.max(0, Math.floor((Date.now() - Date.parse(latestAccountingEntryDate)) / 86400000))
    : null;

  return {
    generatedAt: new Date().toISOString(),
    source: 'laudus',
    readOnly: true,
    payments: {
      total: payments,
      deposited: depositedPayments,
      pendingDeposit: pendingDepositPayments,
      latestSync: latestPaymentsSync,
      actionRequired: pendingDepositPayments > 0,
    },
    creditNotes: {
      total: creditNotes,
      documentedAmount: creditNoteAmount,
      latestSync: latestCreditNotesSync,
      semantics: 'documented credit-note amount from Laudus; not savings or recovered cash',
    },
    costCenters: {
      total: costCenters,
      resolvedExact: resolvedCostCenters,
      unresolved: Math.max(0, costCenters - resolvedCostCenters),
      discontinued: discontinuedCostCenters,
      latestSync: latestCostCentersSync,
      reconciliationRequired: costCenters > resolvedCostCenters,
    },
    accounting: {
      entries: accountingEntries,
      latestEntryDate: latestAccountingEntryDate,
      ageDays: accountingAgeDays,
      currentEnoughForExecutiveUse: accountingAgeDays !== null && accountingAgeDays <= 90,
      semantics: 'historical accounting rows are not presented as current balances',
    },
    fixedAssets: {
      total: fixedAssets,
      linkedToMotil: linkedFixedAssets,
      withAcquisitionCost: fixedAssetsWithCost,
      withAcquisitionDate: fixedAssetsWithDate,
      withUsefulLife: fixedAssetsWithUsefulLife,
      economicsReady: linkedFixedAssets > 0 && fixedAssetsWithCost > 0,
    },
    freshness: {
      latestOperationalSync,
      latestPaymentsSync,
      latestPayablesSync,
      latestInvoicesSync,
      latestCreditNotesSync,
    },
    policy: {
      laudusCanonicalForFinancialFacts: true,
      motilDoesNotWriteLaudus: true,
      humanReviewRequired: true,
    },
  };
}
