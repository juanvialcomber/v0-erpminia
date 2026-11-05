export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [
    { data: payables, error: payablesError },
    { data: payments, error: paymentsError },
  ] = await Promise.all([
    context.supabase.from('procurement_accounts_payable_v1').select('*').eq('organization_id', context.organizationId).order('due_date', { ascending: true, nullsFirst: true }),
    context.supabase.from('procurement_supplier_payments').select('id,organization_id,payable_id,amount,currency,payment_date,payment_reference,notes,recorded_at,reconciled_at,reconciliation_reference,reconciliation_notes').eq('organization_id', context.organizationId).order('payment_date', { ascending: false }),
  ]);

  const anomalyCandidates: Array<Record<string, any>> = [];
  let anomalyError: unknown = null;
  const anomalyPageSize = 1000;
  const anomalyMaxRows = 20000;
  for (let from = 0; from < anomalyMaxRows; from += anomalyPageSize) {
    const { data, error } = await context.supabase
      .from('laudus_purchase_invoice_payment_status_service_v1')
      .select('purchase_invoice_external_id,doc_number,supplier_name,total_amount,currency,paid_amount,payment_count,last_payment_at,payment_status')
      .eq('organization_id', context.organizationId)
      .eq('currency', 'CLP')
      .eq('payment_status', 'paid')
      .order('paid_amount', { ascending: false })
      .range(from, from + anomalyPageSize - 1);

    if (error) {
      anomalyError = error;
      break;
    }
    const page = data || [];
    anomalyCandidates.push(...page);
    if (page.length < anomalyPageSize) break;
  }

  const observedLaudus: Array<Record<string, any>> = [];
  let observedLaudusError: unknown = null;
  const observedPageSize = 1000;
  const observedMaxRows = 5000;
  for (let from = 0; from < observedMaxRows; from += observedPageSize) {
    const { data, error } = await context.supabase
      .from('laudus_purchase_invoice_payment_status_service_v1')
      .select('purchase_invoice_external_id,doc_number,supplier_name,issued_date,due_date,total_amount,currency,paid_amount,outstanding_amount,payment_count,last_payment_at,payment_status')
      .eq('organization_id', context.organizationId)
      .eq('currency', 'CLP')
      .in('payment_status', ['unpaid', 'partially_paid'])
      .gt('outstanding_amount', 0)
      .order('due_date', { ascending: true, nullsFirst: true })
      .range(from, from + observedPageSize - 1);

    if (error) {
      observedLaudusError = error;
      break;
    }
    const page = data || [];
    observedLaudus.push(...page);
    if (page.length < observedPageSize) break;
  }
  if (payablesError || paymentsError) {
    console.error('[finance/payables]', payablesError || paymentsError);
    return NextResponse.json({ payables: [], payments: [], observedPayables: null, paymentReview: null, canEdit: access.canWrite, error: 'No se pudo cargar cuentas por pagar' }, { status: 500 });
  }
  if (anomalyError) {
    console.error('[finance/payables:laudus-payment-review]', anomalyError);
  }
  if (observedLaudusError) {
    console.error('[finance/payables:laudus-observed]', observedLaudusError);
  }
  const isUatValue = (value: unknown) => typeof value === 'string' && /^UAT-/i.test(value.trim());
  const visiblePayables = (payables || []).filter((row) =>
    !isUatValue(row.invoice_number) && !isUatValue(row.supplier_name),
  );
  const visiblePayments = (payments || []).filter((row) =>
    !isUatValue(row.payment_reference) && !isUatValue(row.reconciliation_reference),
  );

  const paymentReviewRows = anomalyError ? [] : anomalyCandidates
    .filter((row) => Number(row.paid_amount || 0) > Number(row.total_amount || 0))
    .map((row) => {
      const totalAmount = Number(row.total_amount || 0);
      const paidAmount = Number(row.paid_amount || 0);
      const excessAmount = paidAmount - totalAmount;
      return {
        ...row,
        total_amount: totalAmount,
        paid_amount: paidAmount,
        excess_amount: excessAmount,
        review_reason: Math.abs(paidAmount - (2 * totalAmount)) <= 0.005 ? 'exact_double_total' : 'additional_partial_excess',
      };
    })
    .sort((a, b) => Number(b.excess_amount || 0) - Number(a.excess_amount || 0));

  const paymentReviewSummary = paymentReviewRows.reduce(
    (summary, row) => {
      summary.itemCount += 1;
      summary.excessAmountClp += Number(row.excess_amount || 0);
      if (row.review_reason === 'exact_double_total') {
        summary.exactDoubleCount += 1;
        summary.exactDoubleAmountClp += Number(row.excess_amount || 0);
      } else {
        summary.additionalPartialCount += 1;
        summary.additionalPartialAmountClp += Number(row.excess_amount || 0);
      }
      return summary;
    },
    { itemCount: 0, excessAmountClp: 0, exactDoubleCount: 0, exactDoubleAmountClp: 0, additionalPartialCount: 0, additionalPartialAmountClp: 0 },
  );

  const observedRows = observedLaudusError ? [] : observedLaudus;
  const observedSummary = observedRows.reduce(
    (summary, row) => {
      const amount = Number(row.outstanding_amount || 0);
      summary.openItems += 1;
      summary.openAmountClp += Number.isFinite(amount) ? amount : 0;
      if (row.payment_status === 'partially_paid') summary.partiallyPaidItems += 1;
      if (row.payment_status === 'unpaid') summary.unpaidItems += 1;
      return summary;
    },
    { openItems: 0, openAmountClp: 0, partiallyPaidItems: 0, unpaidItems: 0 },
  );

  return NextResponse.json({
    payables: visiblePayables,
    payments: visiblePayments,
    observedPayables: {
      source: 'Laudus',
      readOnly: true,
      ...observedSummary,
      items: observedRows.slice(0, 50),
      semantics: 'Exposición financiera observada en Laudus. No constituye una CxP aprobada en MOTIL ni habilita pagos.',
    },
    paymentReview: {
      source: 'Laudus',
      readOnly: true,
      ...paymentReviewSummary,
      rows: paymentReviewRows.slice(0, 20),
      semantics: 'Aplicaciones de pago en Laudus superiores al total nominal de la factura. Requieren revisión documental antes de cualquier ajuste.',
    },
    canEdit: access.canWrite,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  try {
    const body = await request.json();
    const action = String(body.action || '');
    if (action === 'set_due_date') {
      const { error } = await context.supabase.rpc('set_supplier_payable_due_date_v2', { p_organization_id: context.organizationId, p_payable_id: body.payableId, p_due_date: body.dueDate });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    if (action === 'record_payment') {
      const { data, error } = await context.supabase.rpc('record_supplier_payment_v2', {
        p_organization_id: context.organizationId,
        p_payable_id: body.payableId,
        p_amount: body.amount,
        p_payment_date: body.paymentDate,
        p_reference: body.reference ?? null,
        p_notes: body.notes ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ paymentId: data });
    }
    if (action === 'reconcile_payment') {
      const { error } = await context.supabase.rpc('reconcile_supplier_payment_v2', {
        p_organization_id: context.organizationId,
        p_payment_id: body.paymentId,
        p_reference: body.reference,
        p_notes: body.notes ?? null,
      });
      if (error) throw error;
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : typeof error === 'object' && error && 'message' in error ? String(error.message) : 'No se pudo completar la operación';
    return NextResponse.json({ error: message }, { status: 409 });
  }
}
