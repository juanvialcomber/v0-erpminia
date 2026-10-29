export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

async function countRows(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
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
    const [
      purchaseOrders,
      historicalPurchaseOrders,
      laudusPendingPurchaseOrders,
      suppliers,
      intakeRequests,
      operationalOrders,
      receipts,
      invoices,
      accountsPayable,
      documents,
    ] = await Promise.all([
      countRows(
        context.supabase
          .from('canonical_purchase_orders_v1')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId)
          .or('source_file.is.null,source_file.neq.public.purchase_orders'),
      ),
      countRows(
        context.supabase
          .from('canonical_purchase_orders_v1')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId)
          .eq('source_file', 'public.purchase_orders'),
      ),
      countRows(
        context.supabase
          .from('purchase_order_reconciliation_preview_service_v1')
          .select('laudus_purchase_order_id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId)
          .eq('reconciliation_status', 'pending'),
      ),
      countRows(
        context.supabase
          .from('canonical_suppliers_v1')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('procurement_intake_requests')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('procurement_operational_orders')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('procurement_operational_receipts')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('procurement_supplier_invoices')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('procurement_accounts_payable')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId),
      ),
      countRows(
        context.supabase
          .from('module_documents')
          .select('id', { count: 'exact', head: true })
          .eq('organization_id', context.organizationId)
          .eq('module', 'compras')
          .eq('is_active', true)
          .is('deleted_at', null),
      ),
    ]);

    return NextResponse.json({
      canonical: {
        purchaseOrders,
        historicalPurchaseOrders,
        suppliers,
      },
      incoming: {
        laudusPendingPurchaseOrders,
      },
      operational: {
        intakeRequests,
        operationalOrders,
        receipts,
        invoices,
        accountsPayable,
        documents,
      },
      sourcePolicy: {
        purchaseOrders: 'canonical_purchase_orders_v1 (excluye baseline histórico public.purchase_orders)',
        historicalPurchaseOrders: 'canonical_purchase_orders_v1[source_file=public.purchase_orders]',
        laudusPendingPurchaseOrders: 'purchase_order_reconciliation_preview_service_v1[pending]',
        suppliers: 'canonical_suppliers_v1',
        documents: 'module_documents',
      },
      canEdit: access.canWrite,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el resumen de Compras';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
