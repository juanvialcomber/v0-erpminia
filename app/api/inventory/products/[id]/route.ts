export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, { params }: RouteContext) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await params;
    const organizationId = context.organizationId;
    const canonical = context.supabase.schema('canonical');
    const intelligence = context.supabase.schema('intelligence');

    const [productResult, traceResult, positionResult, purchaseLinesResult, receiptLinesResult, movementResult, workOrderPartsResult, laudusIntelligenceResult] = await Promise.all([
      canonical
        .from('products')
        .select('id, product_code, name, description, family, subfamily, unit, standard_cost, minimum_stock, maximum_stock, is_active, validation_status, validation_notes')
        .eq('organization_id', organizationId)
        .eq('id', id)
        .maybeSingle(),
      intelligence
        .from('product_traceability')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('product_id', id)
        .maybeSingle(),
      intelligence
        .from('inventory_position')
        .select('*')
        .eq('organization_id', organizationId)
        .eq('product_id', id)
        .maybeSingle(),
      canonical
        .from('purchase_order_lines')
        .select('id, purchase_order_id, order_number, line_number, quantity, quantity_received, unit, unit_cost, net_amount, cost_center_code, asset_reference, imported_at')
        .eq('organization_id', organizationId)
        .eq('canonical_product_id', id)
        .order('imported_at', { ascending: false })
        .limit(100),
      canonical
        .from('goods_receipt_lines')
        .select('id, receipt_id, purchase_order_line_id, quantity_received, quantity_accepted, quantity_rejected, batch_number, expiry_date, notes, created_at')
        .eq('organization_id', organizationId)
        .eq('canonical_product_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('stock_movements')
        .select('id, stock_id, movement_type, quantity, reference_doc, reference_id, reason, notes, created_at, work_order_id, canonical_asset_id, unit_cost, total_cost')
        .eq('organization_id', organizationId)
        .eq('canonical_product_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('work_order_parts')
        .select('id, work_order_id, canonical_asset_id, quantity_requested, quantity_issued, quantity_installed, quantity_returned, unit_cost, total_cost, status, installed_at, notes, created_at')
        .eq('organization_id', organizationId)
        .eq('canonical_product_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase.rpc('motil_product_laudus_intelligence_preview', {
        p_organization_id: organizationId,
        p_product_id: id,
        p_scope_days: 365,
      }),
    ]);

    const baseError = productResult.error || traceResult.error || positionResult.error || purchaseLinesResult.error || receiptLinesResult.error || movementResult.error || workOrderPartsResult.error || laudusIntelligenceResult.error;
    if (baseError) throw baseError;
    if (!productResult.data) return NextResponse.json({ error: 'Producto no encontrado' }, { status: 404 });

    const purchaseLines = purchaseLinesResult.data || [];
    const receiptLines = receiptLinesResult.data || [];
    const workOrderParts = workOrderPartsResult.data || [];

    const purchaseOrderIds = [...new Set(purchaseLines.map((row) => row.purchase_order_id).filter(Boolean))] as string[];
    const receiptIds = [...new Set(receiptLines.map((row) => row.receipt_id).filter(Boolean))] as string[];
    const workOrderIds = [...new Set(workOrderParts.map((row) => row.work_order_id).filter(Boolean))] as string[];
    const assetIds = [...new Set([
      ...workOrderParts.map((row) => row.canonical_asset_id),
      ...(movementResult.data || []).map((row) => row.canonical_asset_id),
    ].filter(Boolean))] as string[];

    const [purchaseOrdersResult, receiptsResult, workOrdersResult, assetsResult] = await Promise.all([
      purchaseOrderIds.length
        ? canonical
            .from('purchase_orders')
            .select('id, order_number, order_date, supplier_name, supplier_tax_id, canonical_supplier_id, currency, total_amount, operational_status, status')
            .eq('organization_id', organizationId)
            .in('id', purchaseOrderIds)
        : Promise.resolve({ data: [], error: null }),
      receiptIds.length
        ? canonical
            .from('goods_receipts')
            .select('id, receipt_number, purchase_order_id, received_at, received_by_name, warehouse_code, status, notes')
            .eq('organization_id', organizationId)
            .in('id', receiptIds)
        : Promise.resolve({ data: [], error: null }),
      workOrderIds.length
        ? context.supabase
            .from('maintenance_work_orders')
            .select('id, work_order_number, canonical_asset_id, title, status, priority, scheduled_date, completion_date')
            .eq('organization_id', organizationId)
            .in('id', workOrderIds)
        : Promise.resolve({ data: [], error: null }),
      assetIds.length
        ? canonical
            .from('assets')
            .select('id, asset_code, name, category, status')
            .eq('organization_id', organizationId)
            .in('id', assetIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const relatedError = purchaseOrdersResult.error || receiptsResult.error || workOrdersResult.error || assetsResult.error;
    if (relatedError) throw relatedError;

    const purchaseOrders = purchaseOrdersResult.data || [];
    const receipts = receiptsResult.data || [];
    const workOrders = workOrdersResult.data || [];
    const assets = assetsResult.data || [];

    const purchaseOrderMap = new Map(purchaseOrders.map((row) => [row.id, row]));
    const receiptMap = new Map(receipts.map((row) => [row.id, row]));
    const workOrderMap = new Map(workOrders.map((row) => [row.id, row]));
    const assetMap = new Map(assets.map((row) => [row.id, row]));

    const purchases = purchaseLines.map((line) => ({
      ...line,
      purchase_order: line.purchase_order_id ? purchaseOrderMap.get(line.purchase_order_id) || null : null,
    }));
    const goodsReceipts = receiptLines.map((line) => ({
      ...line,
      receipt: receiptMap.get(line.receipt_id) || null,
    }));
    const maintenanceUsage = workOrderParts.map((part) => ({
      ...part,
      work_order: workOrderMap.get(part.work_order_id) || null,
      asset: part.canonical_asset_id ? assetMap.get(part.canonical_asset_id) || null : null,
    }));
    const movements = (movementResult.data || []).map((movement) => ({
      ...movement,
      work_order: movement.work_order_id ? workOrderMap.get(movement.work_order_id) || null : null,
      asset: movement.canonical_asset_id ? assetMap.get(movement.canonical_asset_id) || null : null,
    }));

    const suppliers = Array.from(new Map(
      purchases
        .map((row) => row.purchase_order)
        .filter(Boolean)
        .map((order) => [order!.canonical_supplier_id || order!.supplier_tax_id || order!.supplier_name, order]),
    ).values());

    return NextResponse.json({
      product: productResult.data,
      traceability: traceResult.data || null,
      inventory: positionResult.data || null,
      purchases,
      receipts: goodsReceipts,
      movements,
      maintenanceUsage,
      suppliers,
      assets,
      laudusIntelligence: laudusIntelligenceResult.data || null,
      source: 'canonical_product_traceability',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la trazabilidad del producto';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
