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
      pipelineResult,
      receiptResult,
      maintenanceCostResult,
      maintenanceCostEvidenceResult,
    ] = await Promise.all([
      context.supabase
        .from('procurement_accounts_payable_v1')
        .select('id,invoice_id,invoice_number,supplier_name,outstanding_amount,due_date,days_to_due,status,currency')
        .eq('organization_id', context.organizationId)
        .gt('outstanding_amount', 0)
        .order('due_date', { ascending: true, nullsFirst: true })
        .limit(200),
      context.supabase
        .from('procurement_supplier_payments')
        .select('id,payable_id,amount,currency,payment_date,reconciled_at,payment_reference')
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
        .select('id,order_id,invoice_number,status,approved_for_payment_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      context.supabase
        .from('operational_procurement_pipeline')
        .select('intake_request_id,request_number,order_id,order_number,order_status,work_order_id,canonical_asset_id,supplier_id')
        .eq('organization_id', context.organizationId)
        .not('order_id', 'is', null)
        .limit(300),
      context.supabase
        .from('procurement_operational_receipts')
        .select('id,order_id,status')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(200),
      context.supabase
        .from('maintenance_cost_intelligence_summary_v1')
        .select('completed_work_orders,audited_work_orders,audited_coverage_percent,audited_total_cost,parts_cost,labor_cost,external_cost,last_audited_close_at')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      context.supabase
        .from('maintenance_cost_intelligence_base_v1')
        .select('work_order_id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .or('parts_cost.gt.0,labor_cost.gt.0,external_cost.gt.0,procurement_received_cost.gt.0'),
    ]);

    const firstError =
      payablesResult.error ||
      paymentsResult.error ||
      exceptionsResult.error ||
      invoiceResult.error ||
      pipelineResult.error ||
      receiptResult.error ||
      maintenanceCostResult.error ||
      maintenanceCostEvidenceResult.error;
    if (firstError) throw firstError;

    const pipelineRows = pipelineResult.data || [];
    const validPipelineRows = pipelineRows.filter((row) => !/^UAT-/i.test(String(row.request_number || '').trim()));
    const validOrderIds = new Set(validPipelineRows.map((row) => row.order_id).filter(Boolean));
    const excludedUatOrderIds = new Set(
      pipelineRows
        .filter((row) => /^UAT-/i.test(String(row.request_number || '').trim()))
        .map((row) => row.order_id)
        .filter(Boolean),
    );
    const orderById = new Map<string, any>();
    for (const row of validPipelineRows) {
      if (!row.order_id || orderById.has(row.order_id)) continue;
      orderById.set(row.order_id, row);
    }
    const orders = [...orderById.values()];
    const linkedMaintenanceOrders = orders.filter((row) => row.work_order_id || row.canonical_asset_id);

    const invoices = (invoiceResult.data || []).filter((row) => validOrderIds.has(row.order_id));
    const validInvoiceIds = new Set(invoices.map((row) => row.id));
    const payables = (payablesResult.data || []).filter((row) => validInvoiceIds.has(row.invoice_id));
    const validPayableIds = new Set(payables.map((row) => row.id));
    const unreconciledPayments = (paymentsResult.data || []).filter((row) => validPayableIds.has(row.payable_id));
    const openExceptions = (exceptionsResult.data || []).filter((row) => validInvoiceIds.has(row.invoice_id));
    const receipts = (receiptResult.data || []).filter((row) => validOrderIds.has(row.order_id));

    const dueMissing = payables.filter((row: any) => !row.due_date);
    const overdue = payables.filter((row: any) => row.days_to_due != null && Number(row.days_to_due) < 0);
    const openBalance = payables.reduce((sum: number, row: any) => sum + n(row.outstanding_amount), 0);
    const approvedInvoices = invoices.filter((row: any) => row.status === 'approved' || row.approved_for_payment_at);
    const receivedOrderIds = new Set(receipts.map((row: any) => row.order_id).filter(Boolean));
    const ordersAwaitingReceipt = orders.filter(
      (row: any) =>
        !receivedOrderIds.has(row.order_id) &&
        !['closed', 'cancelled', 'canceled', 'received'].includes(String(row.order_status || '').toLowerCase()),
    );

    const maintenanceCost = maintenanceCostResult.data || null;
    const auditedWorkOrders = n(maintenanceCost?.audited_work_orders);
    const costEvidenceWorkOrders = Number(maintenanceCostEvidenceResult.count || 0);
    const zeroCostSnapshots = Math.max(0, auditedWorkOrders - costEvidenceWorkOrders);
    const costEvidenceCoveragePercent =
      auditedWorkOrders > 0
        ? Math.round((costEvidenceWorkOrders / auditedWorkOrders) * 1000) / 10
        : null;

    let nextAction = {
      key: 'clear',
      title: 'Sin acción financiera prioritaria',
      description: 'MOTIL no detecta una excepción operativa que requiera intervención inmediata.',
      href: '/dashboard/finanzas',
      action: 'Ver resumen',
    };

    if (openExceptions.length > 0) {
      const invoiceId = openExceptions[0].invoice_id;
      const invoice = invoices.find((row: any) => row.id === invoiceId);
      nextAction = {
        key: 'match_exception',
        title: 'Resolver excepción de factura',
        description: invoice?.invoice_number
          ? `Factura ${invoice.invoice_number}: el three-way match mantiene una excepción abierta.`
          : 'Existe una excepción abierta en el three-way match.',
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
    } else if (auditedWorkOrders > 0 && costEvidenceWorkOrders === 0) {
      nextAction = {
        key: 'maintenance_cost_evidence',
        title: 'Completar costo de mantenimiento',
        description: `${zeroCostSnapshots} OT cerradas tienen snapshot auditado, pero todavía no contienen evidencia monetaria capturada.`,
        href: '/dashboard/mantenimiento/costos',
        action: 'Revisar costos',
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
        operationalOrders: orders.length,
        maintenanceLinkedOrders: linkedMaintenanceOrders.length,
        unlinkedOperationalOrders: orders.length - linkedMaintenanceOrders.length,
        excludedUatOrders: excludedUatOrderIds.size,
      },
      maintenanceCost: {
        auditedWorkOrders,
        costEvidenceWorkOrders,
        zeroCostSnapshots,
        costEvidenceCoveragePercent,
        auditedTotalCost: costEvidenceWorkOrders > 0 ? n(maintenanceCost?.audited_total_cost) : null,
        partsCost: costEvidenceWorkOrders > 0 ? n(maintenanceCost?.parts_cost) : null,
        laborCost: costEvidenceWorkOrders > 0 ? n(maintenanceCost?.labor_cost) : null,
        externalCost: costEvidenceWorkOrders > 0 ? n(maintenanceCost?.external_cost) : null,
        lastAuditedCloseAt: maintenanceCost?.last_audited_close_at || null,
        semantics:
          'Un snapshot con $0 sin evidencia monetaria no se interpreta como costo real cero. Compras recibidas sólo cuentan como evidencia cuando están vinculadas explícitamente a la OT.',
      },
      nextAction,
      authority: {
        motil: 'operational_workflow',
        laudus: 'financial_tax_source_read_only',
        human: 'approval_and_payment_authority',
      },
      scope: {
        excludesUat: true,
        pipelineLimit: 300,
      },
    });
  } catch (error) {
    console.error('[finance/operating-control]', error);
    return NextResponse.json({ error: 'No se pudo construir el control operativo financiero.' }, { status: 500 });
  }
}
