export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type RequirementRow = {
  id: string;
  work_order_id: string;
  canonical_product_id: string;
  quantity_required: number | string;
  quantity_available: number | string | null;
  quantity_shortage: number | string | null;
  status: string | null;
  required_date: string | null;
  notes: string | null;
};

type WorkOrderRow = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [requirementsResult, authorityResult] = await Promise.all([
      context.supabase
        .from('work_order_material_requirements')
        .select('id,work_order_id,canonical_product_id,quantity_required,quantity_available,quantity_shortage,status,required_date,notes')
        .eq('organization_id', context.organizationId)
        .neq('status', 'cancelled')
        .order('required_date', { ascending: true, nullsFirst: false })
        .limit(500),
      context.supabase
        .from('bodega_stock_source_authority_service_v1')
        .select('authority_state,authority_reason,latest_laudus_stock_sync,latest_laudus_stock_date')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
    ]);

    if (requirementsResult.error) throw requirementsResult.error;
    if (authorityResult.error) throw authorityResult.error;

    const requirements = (requirementsResult.data || []) as RequirementRow[];
    const workOrderIds = [...new Set(requirements.map((row) => row.work_order_id).filter(Boolean))];
    const productIds = [...new Set(requirements.map((row) => row.canonical_product_id).filter(Boolean))];

    const [workOrdersResult, productsResult, stockResult] = await Promise.all([
      workOrderIds.length
        ? context.supabase
            .from('maintenance_work_orders')
            .select('id,work_order_number,title,status,priority,scheduled_date')
            .eq('organization_id', context.organizationId)
            .in('id', workOrderIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? context.supabase
            .schema('canonical')
            .from('products')
            .select('id,product_code,name,unit')
            .eq('organization_id', context.organizationId)
            .in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? context.supabase
            .from('bodega_inventory_operational_service_v1')
            .select('canonical_product_id,operational_quantity,unit_of_measure,operational_resolution,reconciliation_state,laudus_stock_date,laudus_synced_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const secondaryError = workOrdersResult.error || productsResult.error || stockResult.error;
    if (secondaryError) throw secondaryError;

    const workOrders = new Map((workOrdersResult.data || []).map((row: WorkOrderRow) => [row.id, row]));
    const products = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
    const stock = new Map((stockResult.data || []).map((row: any) => [row.canonical_product_id, row]));

    const rows = requirements.flatMap((requirement) => {
      const workOrder = workOrders.get(requirement.work_order_id);
      const product = products.get(requirement.canonical_product_id);
      if (!workOrder || !product) return [];
      const observation = stock.get(requirement.canonical_product_id) || null;
      return [{
        requirementId: requirement.id,
        workOrderId: workOrder.id,
        workOrderNumber: workOrder.work_order_number,
        workOrderTitle: workOrder.title,
        workOrderStatus: workOrder.status,
        priority: workOrder.priority,
        scheduledDate: workOrder.scheduled_date,
        productId: product.id,
        productCode: product.product_code,
        productName: product.name,
        unit: product.unit || observation?.unit_of_measure || null,
        quantityRequired: Number(requirement.quantity_required || 0),
        historicalQuantityAvailable: requirement.quantity_available === null ? null : Number(requirement.quantity_available),
        historicalShortage: requirement.quantity_shortage === null ? null : Number(requirement.quantity_shortage),
        requirementStatus: requirement.status,
        requiredDate: requirement.required_date,
        notes: requirement.notes,
        observedLaudusQuantity: observation ? Number(observation.operational_quantity || 0) : null,
        stockReconciliationState: observation?.reconciliation_state || 'missing_in_motil',
        operationalResolution: observation?.operational_resolution || null,
        stockSourceDate: observation?.laudus_stock_date || null,
        stockSyncedAt: observation?.laudus_synced_at || null,
      }];
    });

    return NextResponse.json({
      sourceAuthority: authorityResult.data || null,
      rows,
      rowCount: rows.length,
      readOnly: true,
      stockQuantityMeaning: 'Existencia observada en la fuente; no representa una reserva ni disponibilidad comprometida.',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la relación Bodega–Mantención';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
