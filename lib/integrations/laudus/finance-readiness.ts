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
