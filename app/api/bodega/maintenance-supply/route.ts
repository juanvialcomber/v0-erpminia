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

type InstallationDeclaration = {
  requirement_id: string;
  installed_quantity: number | string;
  warehouse_reconciliation_status: string;
  confirmed_at: string | null;
};

type StockObservation = {
  canonical_product_id: string;
  laudus_stock: number | string | null;
  unit_of_measure: string | null;
  product_reconciliation_status: string | null;
  reconciliation_state: string | null;
  source_date_to: string | null;
  laudus_synced_at: string | null;
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
    const requirementIds = [...new Set(requirements.map((row) => row.id).filter(Boolean))];
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
            .from('canonical_products_v1')
            .select('id,product_code,name,unit')
            .eq('organization_id', context.organizationId)
            .in('id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? context.supabase
            .from('laudus_central_warehouse_stock_reconciliation_v1')
            .select('canonical_product_id,laudus_stock,unit_of_measure,product_reconciliation_status,reconciliation_state,source_date_to,laudus_synced_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const secondaryError = workOrdersResult.error || productsResult.error || stockResult.error;
    if (secondaryError) throw secondaryError;

    // Declarations are evidence from supervisors, not warehouse issues.
    // Fetch only requirements visible in this tenant-scoped view, in bounded batches.
    const declarationChunks: InstallationDeclaration[] = [];
    for (let offset = 0; offset < requirementIds.length; offset += 50) {
      const { data: declarations, error: declarationsError } = await context.supabase
        .from('work_order_material_approval_installations')
        .select('requirement_id,installed_quantity,warehouse_reconciliation_status,confirmed_at')
        .eq('organization_id', context.organizationId)
        .in('requirement_id', requirementIds.slice(offset, offset + 50))
        .limit(50);
      if (declarationsError) throw declarationsError;
      declarationChunks.push(...((declarations || []) as InstallationDeclaration[]));
    }
    const declarationsByRequirement = new Map(
      declarationChunks.map((row) => [row.requirement_id, row]),
    );

    const workOrders = new Map((workOrdersResult.data || []).map((row: WorkOrderRow) => [row.id, row]));
    const products = new Map((productsResult.data || []).map((row: any) => [row.id, row]));
    // More than one Laudus source row may map to the same canonical product.
    // Never use last-row-wins for stock decisions: that silently picks an
    // arbitrary quantity when source identities have not been reconciled.
    const stockByProduct = new Map<string, StockObservation[]>();
    for (const observation of (stockResult.data || []) as StockObservation[]) {
      if (!observation.canonical_product_id) continue;
      const current = stockByProduct.get(observation.canonical_product_id) || [];
      current.push(observation);
      stockByProduct.set(observation.canonical_product_id, current);
    }

    const rows = requirements.flatMap((requirement) => {
      const workOrder = workOrders.get(requirement.work_order_id);
      const product = products.get(requirement.canonical_product_id);
      if (!workOrder || !product) return [];
      const declaration = declarationsByRequirement.get(requirement.id) || null;
      const observations = stockByProduct.get(requirement.canonical_product_id) || [];
      const ambiguous = observations.length > 1 ||
        observations.some((row) => row.product_reconciliation_status === 'identity_conflict');
      const observation = ambiguous ? null : observations[0] || null;
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
        unit: product.unit || (observation?.product_reconciliation_status === 'identity_conflict' ? null : observation?.unit_of_measure) || null,
        quantityRequired: Number(requirement.quantity_required || 0),
        historicalQuantityAvailable: requirement.quantity_available === null ? null : Number(requirement.quantity_available),
        historicalShortage: requirement.quantity_shortage === null ? null : Number(requirement.quantity_shortage),
        requirementStatus: requirement.status,
        // Confirmed by supervisor; do NOT interpret as physical issue or reconciled stock.
        reportedInstalledQuantity: declaration ? Number(declaration.installed_quantity) : null,
        installationReconciliationStatus: declaration?.warehouse_reconciliation_status || null,
        installedReportDate: declaration?.confirmed_at || null,
        requiredDate: requirement.required_date,
        notes: requirement.notes,
        observedLaudusQuantity: observation?.laudus_stock == null ? null : Number(observation.laudus_stock),
        stockReconciliationState: ambiguous ? 'review_identity_conflict' : observation?.reconciliation_state || 'review',
        operationalResolution: null,
        stockSourceDate: observation?.source_date_to || null,
        stockSyncedAt: observation?.laudus_synced_at || null,
      }];
    });

    return NextResponse.json({
      sourceAuthority: authorityResult.data || null,
      rows,
      rowCount: rows.length,
      readOnly: true,
      installationQuantityMeaning: 'Cantidad declarada instalada por supervisión; pendiente de revisión de Bodega. No representa retiro, vale ni descuento de inventario.',
      stockQuantityMeaning: 'Saldo observado exclusivamente en Laudus Bodega Central (002); no representa una reserva ni disponibilidad para retirar.',
    });
  } catch (error) {
    // Report the PostgREST error code in server logs, never in the user-facing
    // response. Keep canonical data and inventory untouched on read failure.
    const detail = error && typeof error === 'object'
      ? error as { code?: string; message?: string }
      : null;
    console.error('[bodega/maintenance-supply][GET]', {
      code: detail?.code || 'UNKNOWN',
      message: detail?.message || 'Unexpected query error',
    });
    return NextResponse.json(
      { error: 'No se pudo cargar la relación Bodega–Mantención' },
      { status: 500 },
    );
  }
}
