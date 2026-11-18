export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type CountResult = { count: number | null; error: { message: string } | null };

async function count(query: PromiseLike<CountResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  return result.count ?? 0;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const db = context.supabase;
    const org = context.organizationId;

    const [
      historicalOrders,
      receivedOrders,
      pendingReceiptOrders,
      operationalOrders,
      operationalReceipts,
      supplierInvoices,
      approvedInvoices,
      rejectedInvoices,
      matchedThreeWay,
      exceptionThreeWay,
      rejectedThreeWay,
      pendingReceiptThreeWay,
      laudusInvoices,
      laudusPaid,
      laudusPartiallyPaid,
      laudusUnpaid,
    ] = await Promise.all([
      count(db.from('procurement_receipt_coverage_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', org).eq('receipt_state', 'historical_evidence')),
      count(db.from('procurement_receipt_coverage_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', org).eq('receipt_state', 'received')),
      count(db.from('procurement_receipt_coverage_v1').select('purchase_order_id', { count: 'exact', head: true }).eq('organization_id', org).eq('receipt_state', 'pending_receipt')),
      count(db.from('procurement_operational_orders').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
      count(db.from('procurement_operational_receipts').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
      count(db.from('procurement_supplier_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org)),
      count(db.from('procurement_supplier_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'approved')),
      count(db.from('procurement_supplier_invoices').select('id', { count: 'exact', head: true }).eq('organization_id', org).eq('status', 'rejected')),
      count(db.from('procurement_three_way_match_summary_v1').select('invoice_id', { count: 'exact', head: true }).eq('organization_id', org).eq('match_status', 'matched')),
      count(db.from('procurement_three_way_match_summary_v1').select('invoice_id', { count: 'exact', head: true }).eq('organization_id', org).eq('match_status', 'exception')),
      count(db.from('procurement_three_way_match_summary_v1').select('invoice_id', { count: 'exact', head: true }).eq('organization_id', org).eq('match_status', 'rejected')),
      count(db.from('procurement_three_way_match_summary_v1').select('invoice_id', { count: 'exact', head: true }).eq('organization_id', org).eq('match_status', 'pending_receipt')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', org)),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', org).eq('payment_status', 'paid')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', org).eq('payment_status', 'partially_paid')),
      count(db.from('laudus_purchase_invoice_payment_status_service_v1').select('purchase_invoice_external_id', { count: 'exact', head: true }).eq('organization_id', org).eq('payment_status', 'unpaid')),
    ]);

    return NextResponse.json({
      readOnly: true,
      operational: {
        orders: operationalOrders,
        receipts: operationalReceipts,
        invoices: supplierInvoices,
        invoiceStatus: {
          approved: approvedInvoices,
          rejected: rejectedInvoices,
        },
        threeWay: {
          matched: matchedThreeWay,
          exception: exceptionThreeWay,
          rejected: rejectedThreeWay,
          pendingReceipt: pendingReceiptThreeWay,
        },
      },
      historical: {
        purchaseOrdersReferenceOnly: historicalOrders,
        receivedOperationally: receivedOrders,
        pendingOperationalReceipt: pendingReceiptOrders,
        semantics: 'historical_evidence is contextual evidence only and never proves physical receipt',
      },
      laudus: {
        invoices: laudusInvoices,
        paid: laudusPaid,
        partiallyPaid: laudusPartiallyPaid,
        unpaid: laudusUnpaid,
        linkage: 'source_wide_only',
        semantics: 'Laudus invoice payment status is financial source evidence and is not deterministically attached to a MOTIL operational order unless an explicit trace exists',
      },
      policy: {
        historicalReceiptPromoted: false,
        automaticPaymentApproval: false,
        automaticCanonicalMutation: false,
        humanReviewRequired: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la cadena de evidencia';
    console.error('[procurement/evidence-chain]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
