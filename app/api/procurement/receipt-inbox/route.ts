export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: coverage, error: coverageError } = await context.supabase
      .from('procurement_receipt_coverage_v1')
      .select('purchase_order_id,order_number,order_date,supplier_name,total_amount,currency,order_origin,line_count,ordered_qty,received_qty,pending_qty,receipt_count,last_received_at,receipt_state,human_action_now')
      .eq('organization_id', context.organizationId)
      .eq('order_origin', 'motil_native')
      .eq('human_action_now', true)
      .order('order_date', { ascending: true })
      .limit(100);
    if (coverageError) throw coverageError;

    const orderIds = (coverage || []).map((row) => row.purchase_order_id);
    const { data: lines, error: linesError } = orderIds.length
      ? await context.supabase
          .from('canonical_purchase_order_lines_v1')
          .select('id,purchase_order_id,line_number,product_code,description,quantity,quantity_received,unit,canonical_product_id')
          .eq('organization_id', context.organizationId)
          .in('purchase_order_id', orderIds)
          .order('line_number')
      : { data: [], error: null };
    if (linesError) throw linesError;

    const { count: legacyCount, error: legacyError } = await context.supabase
      .from('procurement_receipt_coverage_v1')
      .select('purchase_order_id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId)
      .eq('order_origin', 'legacy_import');
    if (legacyError) throw legacyError;

    return NextResponse.json({
      pending: coverage || [],
      lines: lines || [],
      summary: {
        pendingNativeOrders: (coverage || []).length,
        legacyOrdersExcluded: legacyCount || 0,
      },
      responsibility: {
        ownerCargo: 'JEFE BODEGA',
        supervisorCargo: 'Jefe de Planificación',
      },
      canReceive: access.canWrite,
      policy: {
        legacyStatusIsPhysicalEvidence: false,
        invoiceIsPhysicalReceiptEvidence: false,
      },
    });
  } catch (error) {
    console.error('[procurement/receipt-inbox][GET]', error);
    return NextResponse.json({ error: 'No fue posible cargar las recepciones pendientes.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json().catch(() => null);
    const purchaseOrderId = String(body?.purchaseOrderId || '').trim();
    const lines = Array.isArray(body?.lines) ? body.lines : [];

    if (!purchaseOrderId || !lines.length) {
      return NextResponse.json({ error: 'Selecciona una OC e ingresa cantidades recibidas.' }, { status: 400 });
    }

    const { data: order, error: orderError } = await context.supabase
      .from('procurement_receipt_coverage_v1')
      .select('purchase_order_id,order_origin,human_action_now')
      .eq('organization_id', context.organizationId)
      .eq('purchase_order_id', purchaseOrderId)
      .maybeSingle();
    if (orderError) throw orderError;
    if (!order || order.order_origin !== 'motil_native') {
      return NextResponse.json({ error: 'Sólo se pueden recepcionar OCs nativas MOTIL desde esta bandeja.' }, { status: 400 });
    }
    if (!order.human_action_now) {
      return NextResponse.json({ error: 'Esta OC ya no tiene recepción pendiente.' }, { status: 409 });
    }

    for (const line of lines) {
      const received = Number(line.quantity_received || 0);
      const accepted = Number(line.quantity_accepted || 0);
      const rejected = Number(line.quantity_rejected || 0);
      if (!Number.isFinite(received) || received <= 0) {
        return NextResponse.json({ error: 'Cada cantidad recibida debe ser mayor que cero.' }, { status: 400 });
      }
      if (![accepted, rejected].every((value) => Number.isFinite(value) && value >= 0)) {
        return NextResponse.json({ error: 'Aceptado y rechazado deben ser valores válidos.' }, { status: 400 });
      }
      if (Math.abs(accepted + rejected - received) > 0.0001) {
        return NextResponse.json({ error: 'Aceptado + rechazado debe coincidir con recibido.' }, { status: 400 });
      }
    }

    const { data, error } = await context.supabase.rpc('receive_purchase_order', {
      p_purchase_order_id: purchaseOrderId,
      p_lines: lines,
      p_warehouse_code: body?.warehouseCode || null,
      p_received_by: context.userId,
      p_received_by_name: context.userName || context.userEmail || null,
      p_notes: body?.notes || null,
    });
    if (error) throw error;

    return NextResponse.json({ ok: true, receiptId: data });
  } catch (error) {
    console.error('[procurement/receipt-inbox][POST]', error);
    return NextResponse.json({ error: 'No fue posible registrar la recepción.' }, { status: 500 });
  }
}
