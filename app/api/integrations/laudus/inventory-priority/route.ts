export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function priorityFor(row: { operational_category?: string | null; laudus_stock?: number | null; quantity_delta?: number | null }) {
  const stock = Number(row.laudus_stock || 0);
  const delta = Math.abs(Number(row.quantity_delta || 0));
  const category = String(row.operational_category || '');
  if (stock < 0) return 100;
  if (category === 'process_consumable' && (stock > 10 || delta > 10)) return 90;
  if (category === 'maintenance_supply' && (stock > 10 || delta > 5)) return 80;
  if (['safety_supply', 'general_supply'].includes(category) && (stock > 10 || delta > 5)) return 70;
  return 10;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: inventoryRows, error: inventoryError } = await context.supabase
      .from('laudus_inventory_reconciliation_service_v1')
      .select('canonical_product_id,sku,description,unit_of_measure,operational_category,laudus_stock,motil_stock,quantity_delta,reconciliation_state,laudus_synced_at,motil_updated_at')
      .eq('organization_id', context.organizationId)
      .in('reconciliation_state', ['missing_in_motil', 'quantity_mismatch'])
      .limit(1000);

    if (inventoryError) throw inventoryError;

    const productIds = [...new Set((inventoryRows || []).map((row) => row.canonical_product_id).filter(Boolean))] as string[];

    const procurementRows: any[] = [];
    for (let offset = 0; offset < productIds.length; offset += 50) {
      const batch = productIds.slice(offset, offset + 50);
      const result = await context.supabase
        .from('product_procurement_status')
        .select('product_id,purchase_order_count,last_purchase_date,days_since_last_purchase,total_spend')
        .eq('organization_id', context.organizationId)
        .in('product_id', batch);

      if (result.error) throw result.error;
      procurementRows.push(...(result.data || []));
    }

    const procurementByProduct = new Map(procurementRows.map((row) => [row.product_id, row]));

    const rows = (inventoryRows || [])
      .map((row) => {
        const procurement = row.canonical_product_id ? procurementByProduct.get(row.canonical_product_id) : null;
        const priority = priorityFor(row);
        const recentPurchase = procurement?.days_since_last_purchase != null && Number(procurement.days_since_last_purchase) <= 365;
        return {
          productId: row.canonical_product_id,
          sku: row.sku,
          description: row.description,
          unit: row.unit_of_measure,
          operationalCategory: row.operational_category,
          laudusStock: row.laudus_stock,
          motilStock: row.motil_stock,
          delta: row.quantity_delta,
          reconciliationState: row.reconciliation_state,
          laudusSyncedAt: row.laudus_synced_at,
          motilUpdatedAt: row.motil_updated_at,
          priority,
          recentPurchase,
          purchaseOrderCount: procurement?.purchase_order_count ?? null,
          lastPurchaseDate: procurement?.last_purchase_date ?? null,
          daysSinceLastPurchase: procurement?.days_since_last_purchase ?? null,
          totalSpend: procurement?.total_spend ?? null,
        };
      })
      .filter((row) => row.priority >= 70 && row.recentPurchase)
      .sort((a, b) => b.priority - a.priority || Math.abs(Number(b.delta || b.laudusStock || 0)) - Math.abs(Number(a.delta || a.laudusStock || 0)))
      .slice(0, 50);

    return NextResponse.json({
      rows,
      summary: {
        prioritized: rows.length,
        negative: rows.filter((row) => Number(row.laudusStock || 0) < 0).length,
        process: rows.filter((row) => row.operationalCategory === 'process_consumable').length,
        maintenance: rows.filter((row) => row.operationalCategory === 'maintenance_supply').length,
        other: rows.filter((row) => ['safety_supply', 'general_supply'].includes(String(row.operationalCategory || ''))).length,
      },
      policy: {
        source: 'Laudus',
        readOnly: true,
        canonicalMutation: false,
        thresholdNote: 'Only material, recently purchased discrepancies are surfaced. Low-materiality backlog remains silent.',
      },
    });
  } catch (error) {
    console.error('[laudus/inventory-priority][GET]', {
      organizationId: context.organizationId,
      message: error instanceof Error ? error.message : 'unknown',
    });
    return NextResponse.json({ error: 'No fue posible cargar la prioridad Laudus de Bodega.' }, { status: 500 });
  }
}
