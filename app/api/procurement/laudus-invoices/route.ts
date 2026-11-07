export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const MAX_ROWS = 20;

function num(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const base = () => context.supabase
      .from('laudus_purchase_invoice_payment_status_service_v1')
      .select('purchase_invoice_external_id,doc_number,supplier_name,issued_date,due_date,total_amount,currency,paid_amount,outstanding_amount,payment_count,payment_status');

    const [paidCount, partialCount, unpaidCount, creditCount, openRows] = await Promise.all([
      context.supabase.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('payment_status', 'paid'),
      context.supabase.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('payment_status', 'partially_paid'),
      context.supabase.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('payment_status', 'unpaid'),
      context.supabase.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', context.organizationId).eq('payment_status', 'credit_adjustment'),
      base()
        .eq('organization_id', context.organizationId)
        .in('payment_status', ['unpaid', 'partially_paid'])
        .order('outstanding_amount', { ascending: false })
        .limit(MAX_ROWS),
    ]);

    const error = paidCount.error || partialCount.error || unpaidCount.error || creditCount.error || openRows.error;
    if (error) throw error;

    const rows = (openRows.data || []).map((row) => ({
      externalId: String(row.purchase_invoice_external_id || ''),
      documentNumber: row.doc_number ? String(row.doc_number) : null,
      supplierName: row.supplier_name ? String(row.supplier_name) : null,
      issuedDate: row.issued_date || null,
      dueDate: row.due_date || null,
      totalAmount: num(row.total_amount),
      currency: row.currency ? String(row.currency) : null,
      paidAmount: num(row.paid_amount),
      outstandingAmount: num(row.outstanding_amount),
      paymentCount: Number(row.payment_count || 0),
      paymentStatus: String(row.payment_status || ''),
    }));

    return NextResponse.json({
      summary: {
        paid: paidCount.count || 0,
        partiallyPaid: partialCount.count || 0,
        unpaid: unpaidCount.count || 0,
        creditAdjustments: creditCount.count || 0,
        open: (partialCount.count || 0) + (unpaidCount.count || 0),
        total: (paidCount.count || 0) + (partialCount.count || 0) + (unpaidCount.count || 0) + (creditCount.count || 0),
        rowsShown: rows.length,
      },
      rows,
      source: 'Laudus',
      readOnly: true,
      semantics: {
        sourceInvoiceIsNotMotilOperationalInvoice: true,
        sourcePaymentStatusIsNotMotilPaymentApproval: true,
        sourceInvoiceIsNotThreeWayMatch: true,
        canonicalMutationExecuted: false,
        laudusMutationExecuted: false,
      },
    });
  } catch (error) {
    console.error('[procurement/laudus-invoices]', error);
    return NextResponse.json({ error: 'No fue posible consultar las facturas fuente Laudus.' }, { status: 500 });
  }
}
