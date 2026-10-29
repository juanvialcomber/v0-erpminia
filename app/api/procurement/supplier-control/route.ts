export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const TOLERANCE = 0.01;

type InputLine = {
  orderLineId?: string;
  receiptLineId?: string;
  canonicalProductId?: string;
  quantity?: number | string;
  unitCost?: number | string;
};

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const orderId = request.nextUrl.searchParams.get('orderId');

  try {
    let returnsQuery = context.supabase.from('procurement_supplier_returns').select('*, procurement_supplier_return_lines(*)').eq('organization_id', context.organizationId).order('created_at', { ascending: false }).limit(100);
    let invoicesQuery = context.supabase.from('procurement_supplier_invoices').select('*, procurement_supplier_invoice_lines(*), procurement_match_exceptions(*)').eq('organization_id', context.organizationId).order('created_at', { ascending: false }).limit(100);
    let ordersQuery = context.supabase.from('procurement_operational_orders').select('id, order_number, supplier_id, status, currency, total_amount, expected_delivery_date, actual_delivery_date').eq('organization_id', context.organizationId).neq('status', 'cancelled').order('issued_at', { ascending: false }).limit(100);
    let orderLinesQuery = context.supabase.from('procurement_operational_order_lines').select('id, order_id, canonical_product_id, product_code, description, unit, quantity_ordered, quantity_received, unit_cost').eq('organization_id', context.organizationId);
    let receiptsQuery = context.supabase.from('procurement_operational_receipts').select('id, receipt_number, order_id, received_at, notes').eq('organization_id', context.organizationId).order('received_at', { ascending: false }).limit(100);
    let receiptLinesQuery = context.supabase.from('procurement_operational_receipt_lines').select('id, receipt_id, order_line_id, canonical_product_id, quantity_received, quantity_accepted, quantity_rejected, unit_cost').eq('organization_id', context.organizationId);

    if (orderId) {
      returnsQuery = returnsQuery.eq('order_id', orderId);
      invoicesQuery = invoicesQuery.eq('order_id', orderId);
      ordersQuery = ordersQuery.eq('id', orderId);
      orderLinesQuery = orderLinesQuery.eq('order_id', orderId);
      receiptsQuery = receiptsQuery.eq('order_id', orderId);
    }

    const [returnsResult, invoicesResult, ordersResult, orderLinesResult, receiptsResult, receiptLinesResult, performanceResult] = await Promise.all([
      returnsQuery,
      invoicesQuery,
      ordersQuery,
      orderLinesQuery,
      receiptsQuery,
      receiptLinesQuery,
      context.supabase.from('supplier_operational_score_v2').select('*').eq('organization_id', context.organizationId).order('operational_score', { ascending: false, nullsFirst: false }).limit(100),
    ]);

    const error = [returnsResult, invoicesResult, ordersResult, orderLinesResult, receiptsResult, receiptLinesResult, performanceResult].find((result) => result.error)?.error;
    if (error) throw error;

    return NextResponse.json({
      returns: returnsResult.data || [],
      invoices: invoicesResult.data || [],
      orders: ordersResult.data || [],
      orderLines: orderLinesResult.data || [],
      receipts: receiptsResult.data || [],
      receiptLines: receiptLinesResult.data || [],
      supplierPerformance: performanceResult.data || [],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar el control de proveedores.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const action = String(body.action || '');

    if (action === 'create_return') {
      const sourceLines: InputLine[] = Array.isArray(body.lines) ? body.lines : [];
      if (!body.orderId || !body.supplierId || !String(body.reason || '').trim() || sourceLines.length === 0) {
        return NextResponse.json({ error: 'Completa la orden, el proveedor, el motivo y al menos un producto.' }, { status: 400 });
      }

      const normalizedLines = sourceLines.map((line) => ({
        receipt_line_id: line.receiptLineId,
        order_line_id: line.orderLineId,
        canonical_product_id: line.canonicalProductId,
        quantity: Number(line.quantity),
        unit_cost: Number(line.unitCost || 0),
      }));
      if (normalizedLines.some((line) => !line.receipt_line_id || !line.order_line_id || !line.canonical_product_id || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) {
        return NextResponse.json({ error: 'Revisa los productos, cantidades y costos de la devolución.' }, { status: 400 });
      }

      const receiptLineIds = normalizedLines.map((line) => line.receipt_line_id as string);
      const { data: receiptLines, error: receiptLinesError } = await context.supabase
        .from('procurement_operational_receipt_lines')
        .select('id, order_line_id, canonical_product_id, quantity_rejected')
        .eq('organization_id', context.organizationId)
        .in('id', receiptLineIds);
      if (receiptLinesError) throw receiptLinesError;

      for (const line of normalizedLines) {
        const source = (receiptLines || []).find((item) => item.id === line.receipt_line_id);
        if (!source || source.order_line_id !== line.order_line_id || source.canonical_product_id !== line.canonical_product_id || line.quantity > Number(source.quantity_rejected || 0) + TOLERANCE) {
          return NextResponse.json({ error: 'La devolución supera la cantidad rechazada o no corresponde a la recepción seleccionada.' }, { status: 400 });
        }
      }

      const returnNumber = `DEV-${Date.now()}`;
      const { data: createdReturn, error: returnError } = await context.supabase.from('procurement_supplier_returns').insert({
        organization_id: context.organizationId,
        return_number: returnNumber,
        order_id: body.orderId,
        receipt_id: body.receiptId || null,
        supplier_id: body.supplierId,
        reason: String(body.reason).trim(),
        resolution_type: body.resolutionType || 'pending',
        status: 'draft',
        evidence_url: body.evidenceUrl || null,
        requested_by: context.userId,
        notes: body.notes || null,
      }).select('id, return_number').single();
      if (returnError) throw returnError;

      const { error: linesError } = await context.supabase.from('procurement_supplier_return_lines').insert(normalizedLines.map((line) => ({ ...line, organization_id: context.organizationId, return_id: createdReturn.id })));
      if (linesError) {
        await context.supabase.from('procurement_supplier_returns').delete().eq('id', createdReturn.id).eq('organization_id', context.organizationId);
        throw linesError;
      }

      return NextResponse.json({ id: createdReturn.id, returnNumber: createdReturn.return_number }, { status: 201 });
    }

    if (action === 'create_invoice') {
      const sourceLines: InputLine[] = Array.isArray(body.lines) ? body.lines : [];
      if (!body.orderId || !body.supplierId || !String(body.invoiceNumber || '').trim() || !body.invoiceDate || sourceLines.length === 0) {
        return NextResponse.json({ error: 'Completa la factura y agrega al menos un producto.' }, { status: 400 });
      }

      const invoiceLines = sourceLines.map((line) => ({ order_line_id: line.orderLineId, canonical_product_id: line.canonicalProductId, quantity: Number(line.quantity), unit_cost: Number(line.unitCost) }));
      if (invoiceLines.some((line) => !line.order_line_id || !line.canonical_product_id || !Number.isFinite(line.quantity) || line.quantity <= 0 || !Number.isFinite(line.unit_cost) || line.unit_cost < 0)) {
        return NextResponse.json({ error: 'Revisa las cantidades y precios de la factura.' }, { status: 400 });
      }

      const { data: orderLines, error: orderLinesError } = await context.supabase.from('procurement_operational_order_lines').select('id, canonical_product_id, quantity_ordered, quantity_received, unit_cost').eq('organization_id', context.organizationId).eq('order_id', body.orderId);
      if (orderLinesError) throw orderLinesError;

      const calculatedNet = invoiceLines.reduce((total, line) => total + line.quantity * line.unit_cost, 0);
      const taxAmount = Number(body.taxAmount || 0);
      const totalAmount = Number(body.totalAmount || calculatedNet + taxAmount);
      if (![calculatedNet, taxAmount, totalAmount].every((value) => Number.isFinite(value) && value >= 0)) {
        return NextResponse.json({ error: 'Los montos de la factura no son válidos.' }, { status: 400 });
      }

      const { data: invoice, error: invoiceError } = await context.supabase.from('procurement_supplier_invoices').insert({
        organization_id: context.organizationId,
        invoice_number: String(body.invoiceNumber).trim(),
        supplier_id: body.supplierId,
        order_id: body.orderId,
        invoice_date: body.invoiceDate,
        currency: body.currency || 'CLP',
        net_amount: calculatedNet,
        tax_amount: taxAmount,
        total_amount: totalAmount,
        status: 'pending_match',
        document_url: body.documentUrl || null,
        created_by: context.userId,
      }).select('id').single();
      if (invoiceError) throw invoiceError;

      const { error: invoiceLinesError } = await context.supabase.from('procurement_supplier_invoice_lines').insert(invoiceLines.map((line) => ({ ...line, organization_id: context.organizationId, invoice_id: invoice.id })));
      if (invoiceLinesError) {
        await context.supabase.from('procurement_supplier_invoices').delete().eq('id', invoice.id).eq('organization_id', context.organizationId);
        throw invoiceLinesError;
      }

      const exceptions: Array<Record<string, unknown>> = [];
      for (const line of invoiceLines) {
        const ordered = (orderLines || []).find((item) => item.id === line.order_line_id);
        if (!ordered || ordered.canonical_product_id !== line.canonical_product_id) {
          exceptions.push({ organization_id: context.organizationId, invoice_id: invoice.id, order_line_id: line.order_line_id, exception_type: 'unknown_product' });
          continue;
        }
        const received = Number(ordered.quantity_received || 0);
        if (received + TOLERANCE < line.quantity) exceptions.push({ organization_id: context.organizationId, invoice_id: invoice.id, order_line_id: line.order_line_id, exception_type: received === 0 ? 'missing_receipt' : 'quantity', expected_value: received, actual_value: line.quantity, difference: line.quantity - received });
        const expectedCost = Number(ordered.unit_cost || 0);
        if (Math.abs(expectedCost - line.unit_cost) > TOLERANCE) exceptions.push({ organization_id: context.organizationId, invoice_id: invoice.id, order_line_id: line.order_line_id, exception_type: 'unit_price', expected_value: expectedCost, actual_value: line.unit_cost, difference: line.unit_cost - expectedCost });
      }

      if (exceptions.length > 0) {
        const { error: exceptionError } = await context.supabase.from('procurement_match_exceptions').insert(exceptions);
        if (exceptionError) throw exceptionError;
      }

      const status = exceptions.length === 0 ? 'matched' : 'exception';
      const { error: statusError } = await context.supabase.from('procurement_supplier_invoices').update({ status, updated_at: new Date().toISOString() }).eq('id', invoice.id).eq('organization_id', context.organizationId);
      if (statusError) throw statusError;

      return NextResponse.json({ id: invoice.id, status, exceptions: exceptions.length }, { status: 201 });
    }

    return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo completar la operación.' }, { status: 500 });
  }
}
