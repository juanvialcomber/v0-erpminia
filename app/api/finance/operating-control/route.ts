export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function n(value: unknown) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [
      payablesResult,
      paymentsResult,
      exceptionsResult,
      invoiceResult,
      orderResult,
      receiptResult,
    ] = await Promise.all([
      context.supabase
        .from('procurement_accounts_payable_v1')
        .select('id,invoice_number,supplier_name,outstanding_amount,due_date,days_to_due,status,currency')
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0)
        .order('due_date', { ascending: true, nullsFirst: true })
        .limit(200),
      context.supabase
        .from('procurement_supplier_payments')
        .select('id,amount,currency,payment_date,reconciled_at,payment_reference')
        .eq('organization_id', context.organizationId)
        .is('reconciled_at', null)
        .order('payment_date', { ascending: false })
        .limit(100),
      context.supabase
        .from('procurement_match_exceptions')
        .select('id,invoice_id,exception_type,created_at')
        .eq('organization_id', context.organizationId)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(100),
      context.supabase
        .from('procurement_supplier_invoices')
        .select('id,invoice_number,status,approved_for_payment_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      context.supabase
        .from('procurement_operational_orders')
        .select('id,order_number,status')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      context.supabase
        .from('procurement_operational_receipts')
        .select('id,order_id,status')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
    ]);

    const firstError = payablesResult.error || paymentsResult.error || exceptionsResult.error || invoiceResult.error || orderResult.error || receiptResult.error;
    if (firstError) throw firstError;

    const payables = payablesResult.data || [];
    const unreconciledPayments = paymentsResult.data || [];
    const openExceptions = exceptionsResult.data || [];
    const invoices = invoiceResult.data || [];
    const orders = orderResult.data || [];
    const receipts = receiptResult.data || [];

    const dueMissing = payables.filter((row:any) => !row.due_date);
    const overdue = payables.filter((row:any) => row.days_to_due != null && Number(row.days_to_due) < 0);
    const openBalance = payables.reduce((sum:number,row:any) => sum + n(row.outstanding_amount), 0);
    const approvedInvoices = invoices.filter((row:any) => row.status === 'approved' || row.approved_for_payment_at);
    const receivedOrderIds = new Set(receipts.map((row:any) => row.order_id).filter(Boolean));
    const ordersAwaitingReceipt = orders.filter((row:any) => !receivedOrderIds.has(row.id) && !['closed','cancelled','canceled'].includes(String(row.status || '').toLowerCase()));

    let nextAction = {
      key: 'clear',
      title: 'Sin acción financiera prioritaria',
      description: 'MOTIL no detecta una excepción operativa que requiera intervención inmediata.',
      href: '/dashboard/finanzas',
      action: 'Ver resumen',
    };

    if (openExceptions.length > 0) {
      const invoiceId = openExceptions[0].invoice_id;
      const invoice = invoices.find((row:any) => row.id === invoiceId);
      nextAction = {
        key: 'match_exception',
        title: 'Resolver excepción de factura',
        description: invoice?.invoice_number ? `Factura ${invoice.invoice_number}: el three-way match mantiene una excepción abierta.` : 'Existe una excepción abierta en el three-way match.',
        href: '/dashboard/compras/facturas',
        action: 'Resolver',
      };
    } else if (dueMissing.length > 0) {
      nextAction = {
        key: 'due_date',
        title: 'Definir vencimiento',
        description: `Factura ${dueMissing[0].invoice_number || 'sin número'}: la obligación aprobada no tiene fecha de vencimiento.`,
        href: '/dashboard/finanzas/pagos',
        action: 'Definir',
      };
    } else if (overdue.length > 0) {
      nextAction = {
        key: 'overdue',
        title: 'Atender pago vencido',
        description: `Factura ${overdue[0].invoice_number || 'sin número'} mantiene saldo vencido pendiente.`,
        href: '/dashboard/finanzas/pagos',
        action: 'Revisar',
      };
    } else if (unreconciledPayments.length > 0) {
      nextAction = {
        key: 'reconcile_payment',
        title: 'Conciliar pago',
        description: 'Existe un pago registrado en MOTIL que todavía no tiene conciliación bancaria/contable.',
        href: '/dashboard/finanzas/pagos',
        action: 'Conciliar',
      };
    } else if (ordersAwaitingReceipt.length > 0) {
      nextAction = {
        key: 'receive_order',
        title: 'Completar recepción',
        description: `${ordersAwaitingReceipt[0].order_number || 'Una OC'} todavía no tiene recepción operativa registrada.`,
        href: '/dashboard/compras/flujo',
        action: 'Recibir',
      };
    }

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      summary: {
        openMatchExceptions: openExceptions.length,
        payablesWithBalance: payables.length,
        overduePayables: overdue.length,
        payablesMissingDueDate: dueMissing.length,
        unreconciledPayments: unreconciledPayments.length,
        approvedInvoices: approvedInvoices.length,
        ordersAwaitingReceipt: ordersAwaitingReceipt.length,
        openBalance,
      },
      nextAction,
      authority: {
        motil: 'operational_workflow',
        laudus: 'financial_tax_source_read_only',
        human: 'approval_and_payment_authority',
      },
    });
  } catch (error) {
    console.error('[finance/operating-control]', error);
    return NextResponse.json({ error: 'No se pudo construir el control operativo financiero.' }, { status: 500 });
  }
}
