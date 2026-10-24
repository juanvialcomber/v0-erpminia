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

async function loadLaudusFinancialEvidence(
  db: SupabaseClient,
  organizationId: string,
) {
  try {
    const invoices = db.from('laudus_purchase_invoice_payment_status_service_v1');

    const [
      payableDocuments,
      paidDocuments,
      partiallyPaidDocuments,
      unpaidDocuments,
      creditAdjustments,
      stagedPayments,
      latestInvoiceSync,
    ] = await Promise.all([
      count(invoices.select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('total_amount', 0)),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('total_amount', 0).eq('payment_status', 'paid')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('total_amount', 0).eq('payment_status', 'partially_paid')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', organizationId).gt('total_amount', 0).eq('payment_status', 'unpaid')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', organizationId).lt('total_amount', 0)),
      count(db.from('laudus_purchase_payments_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
      db.from('laudus_purchase_invoices_service_v1')
        .select('synced_at')
        .eq('organization_id', organizationId)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestInvoiceSync.error) throw new Error(latestInvoiceSync.error.message);

    return {
      available: true,
      payableDocuments,
      paidDocuments,
      partiallyPaidDocuments,
      unpaidDocuments,
      openDocuments: partiallyPaidDocuments + unpaidDocuments,
      creditAdjustments,
      stagedPayments,
      latestSyncAt: latestInvoiceSync.data?.synced_at ?? null,
    };
  } catch {
    return {
      available: false,
      payableDocuments: 0,
      paidDocuments: 0,
      partiallyPaidDocuments: 0,
      unpaidDocuments: 0,
      openDocuments: 0,
      creditAdjustments: 0,
      stagedPayments: 0,
      latestSyncAt: null,
    };
  }
}

async function loadLaudusAccountingEvidence(
  db: SupabaseClient,
  organizationId: string,
) {
  try {
    const [accountingEntries, bankStatements, pendingDtes, latestEntry] = await Promise.all([
      count(db.from('laudus_accounting_entries_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
      count(db.from('laudus_bank_statements_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
      count(db.from('laudus_dtes_service_v1').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
      db.from('laudus_accounting_entries_service_v1')
        .select('synced_at')
        .eq('organization_id', organizationId)
        .order('synced_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (latestEntry.error) throw new Error(latestEntry.error.message);

    return {
      available: accountingEntries > 0 || bankStatements > 0 || pendingDtes > 0,
      accountingEntries,
      bankStatements,
      pendingDtes,
      latestSyncAt: latestEntry.data?.synced_at ?? null,
    };
  } catch {
    return {
      available: false,
      accountingEntries: 0,
      bankStatements: 0,
      pendingDtes: 0,
      latestSyncAt: null,
    };
  }
}

export async function loadLaudusFinanceReadiness(
  db: SupabaseClient,
  organizationId: string,
) {
  const [
    payables,
    payablesWithInvoice,
    payablesWithSupplier,
    payablesWithAmount,
    payablesWithDueDate,
    payablesWithCurrency,
    payments,
    paymentsWithPayable,
    paymentsWithAmount,
    paymentsWithDate,
    paymentsWithCurrency,
    paymentsReconciled,
    paymentRequests,
    paymentSignatures,
    laudusEvidence,
    accountingEvidence,
  ] = await Promise.all([
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('invoice_id', 'is', null)),
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('supplier_id', 'is', null)),
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('approved_amount', 'is', null)),
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('due_date', 'is', null)),
    count(db.from('procurement_accounts_payable').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('currency', 'is', null).neq('currency', '')),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('payable_id', 'is', null)),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('amount', 'is', null)),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('payment_date', 'is', null)),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('currency', 'is', null).neq('currency', '')),
    count(db.from('procurement_supplier_payments').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId).not('reconciled_at', 'is', null)),
    count(db.from('finance_payment_requests').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    count(db.from('finance_payment_request_signatures').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)),
    loadLaudusFinancialEvidence(db, organizationId),
    loadLaudusAccountingEvidence(db, organizationId),
  ]);

  let laudusState: 'waiting_laudus' | 'ready_to_compare' | 'review' = 'waiting_laudus';

  try {
    const source = await db
      .from('laudus_source_status_service_v1')
      .select('enabled,latest_status')
      .eq('organization_id', organizationId)
      .maybeSingle();

    if (!source.error && source.data?.enabled) {
      const status = String(source.data.latest_status || '').toLowerCase();
      if (status === 'completed') laudusState = 'ready_to_compare';
      if (status === 'partial' || status === 'failed') laudusState = 'review';
    }
  } catch {
    // Expected before the private service facade is deployed.
  }

  if ((laudusEvidence.available || accountingEvidence.available) && laudusState === 'waiting_laudus') {
    laudusState = 'ready_to_compare';
  }

  return {
    payables: {
      total: payables,
      invoiceCoverage: pct(payablesWithInvoice, payables),
      supplierCoverage: pct(payablesWithSupplier, payables),
      amountCoverage: pct(payablesWithAmount, payables),
      dueDateCoverage: pct(payablesWithDueDate, payables),
      currencyCoverage: pct(payablesWithCurrency, payables),
    },
    payments: {
      total: payments,
      payableCoverage: pct(paymentsWithPayable, payments),
      amountCoverage: pct(paymentsWithAmount, payments),
      dateCoverage: pct(paymentsWithDate, payments),
      currencyCoverage: pct(paymentsWithCurrency, payments),
      reconciliationCoverage: pct(paymentsReconciled, payments),
    },
    approvals: {
      paymentRequests,
      paymentSignatures,
    },
    laudusEvidence,
    accountingEvidence,
    reconciliation: {
      state: laudusState,
      autoCreatePayment: false,
      autoReconcilePayment: false,
      humanApprovalRequired: true,
    },
    policy: {
      laudusFinanceRole: 'financial_source',
      motilPaymentApprovalRole: 'human_authority',
    },
  };
}
