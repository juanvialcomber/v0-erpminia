export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type RiskRow = {
  name?: string | null;
  family?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  risk_score?: number | null;
  price_ratio?: number | null;
  risk_reasons?: string[] | null;
  laudus_matched?: boolean | null;
  purchase_lines?: number | null;
  supplier_count?: number | null;
  affected_assets?: number | null;
  last_purchase_at?: string | null;
  minimum_required?: number | null;
  latest_unit_price?: number | null;
  median_unit_price?: number | null;
  active_work_orders?: number | null;
  quantity_available?: number | null;
  top_supplier_share?: number | null;
  active_required_qty?: number | null;
  active_shortage_qty?: number | null;
};

const n = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const money = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase.rpc('motil_supply_risk_preview', {
    p_organization_id: context.organizationId,
    p_scope_days: 365,
  });

  if (error) {
    console.error('[inventory/laudus-intelligence]', error);
    return NextResponse.json({ error: 'No fue posible construir la inteligencia de Bodega.' }, { status: 500 });
  }

  const rows: RiskRow[] = Array.isArray(data?.top_actions) ? data.top_actions : [];

  const candidates = rows.map((row) => {
    const quantity = n(row.quantity_available);
    const minimum = n(row.minimum_required);
    const activeShortage = n(row.active_shortage_qty);
    const activeWorkOrders = n(row.active_work_orders);
    const priceRatio = n(row.price_ratio);
    const supplierCount = n(row.supplier_count);
    const purchaseLines = n(row.purchase_lines);
    const supplierShare = n(row.top_supplier_share);
    const latestPrice = money(row.latest_unit_price);
    const medianPrice = money(row.median_unit_price);

    let priority = 0;
    let decision: 'maintenance' | 'stock' | 'price' | 'supplier' | 'review' = 'review';
    let title = 'Revisar evidencia de producto';
    let action = 'Revisar el detalle antes de decidir una reposición.';

    if (activeShortage > 0 || activeWorkOrders > 0) {
      priority = 100 + activeShortage * 10 + activeWorkOrders;
      decision = 'maintenance';
      title = 'Demanda activa de mantenimiento';
      action = 'Revisar cobertura de la OT y disponibilidad real antes de comprometer la intervención.';
    } else if (quantity < 0) {
      priority = 90 + Math.abs(quantity);
      decision = 'stock';
      title = 'Saldo negativo por conciliar';
      action = 'Conciliar movimientos y conteo físico antes de usar esta disponibilidad.';
    } else if (row.laudus_matched && priceRatio >= 1.2 && purchaseLines >= 2) {
      priority = 70 + Math.min(priceRatio, 3) * 10 + Math.min(purchaseLines, 20) / 10;
      decision = 'price';
      title = priceRatio >= 1.5 ? 'Precio muy sobre su referencia observada' : 'Precio sobre su referencia observada';
      action = 'Validar especificación, última compra y cotización antes de reponer.';
    } else if (row.laudus_matched && supplierCount === 1 && purchaseLines >= 3) {
      priority = 55 + Math.min(purchaseLines, 20) / 10;
      decision = 'supplier';
      title = 'Dependencia de un solo proveedor';
      action = 'Evaluar una segunda fuente si el producto es recurrente o crítico para la operación.';
    } else {
      priority = n(row.risk_score);
    }

    const evidence: string[] = [];
    evidence.push(`Stock disponible: ${quantity}`);
    if (minimum > 0) evidence.push(`Mínimo registrado: ${minimum}`);
    if (latestPrice !== null) evidence.push(`Último precio observado: ${latestPrice}`);
    if (medianPrice !== null) evidence.push(`Mediana histórica: ${medianPrice}`);
    if (row.laudus_matched && priceRatio > 0) evidence.push(`Relación precio: ${priceRatio.toFixed(2)}x`);
    if (row.laudus_matched && supplierCount > 0) evidence.push(`${supplierCount} proveedor(es) observados`);
    if (supplierShare > 0) evidence.push(`Principal proveedor: ${Math.round(supplierShare * 100)}% de líneas observadas`);
    if (purchaseLines > 0) evidence.push(`${purchaseLines} líneas de compra observadas`);
    if (activeWorkOrders > 0) evidence.push(`${activeWorkOrders} OT activas relacionadas`);
    if (activeShortage > 0) evidence.push(`Faltante activo: ${activeShortage}`);

    return {
      productId: row.product_id || null,
      productCode: row.product_code || 'Sin código',
      productName: row.name || 'Producto sin nombre',
      family: row.family || null,
      decision,
      title,
      action,
      priority,
      riskScore: n(row.risk_score),
      quantityAvailable: quantity,
      minimumRequired: minimum || null,
      latestUnitPrice: latestPrice,
      medianUnitPrice: medianPrice,
      priceRatio: priceRatio || null,
      supplierCount,
      topSupplierShare: supplierShare || null,
      purchaseLines,
      lastPurchaseAt: row.last_purchase_at || null,
      activeWorkOrders,
      activeShortageQty: activeShortage,
      laudusMatched: Boolean(row.laudus_matched),
      evidence,
      source: row.laudus_matched ? 'MOTIL + Laudus' : 'MOTIL',
    };
  });

  const material = candidates
    .filter((row) => row.decision !== 'review')
    .sort((a, b) => b.priority - a.priority)
    .slice(0, 8);

  return NextResponse.json({
    source: 'MOTIL + Laudus',
    readOnly: true,
    generatedAt: new Date().toISOString(),
    summary: {
      totalProducts: n(data?.summary?.total_products),
      laudusMatchedProducts: n(data?.summary?.laudus_matched_products),
      highRisk: n(data?.summary?.high_risk),
      mediumRisk: n(data?.summary?.medium_risk),
      activeMaintenanceShortages: n(data?.summary?.active_maintenance_shortages),
      priceOutliers20pct: n(data?.summary?.price_outliers_20pct),
      singleSupplierProducts: n(data?.summary?.single_supplier_products),
    },
    cases: material,
    policy: {
      lowMinimumAloneIsUrgent: false,
      noAutomaticReplenishment: true,
      noAutomaticSupplierDecision: true,
      noLaudusWrite: true,
    },
  });
}
