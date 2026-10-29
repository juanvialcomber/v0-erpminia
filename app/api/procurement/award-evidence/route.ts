export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const AWARD_REASONS = new Set(['price', 'lead_time', 'performance', 'urgency', 'commercial_terms', 'continuity', 'other']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const requestId = request.nextUrl.searchParams.get('requestId');

    let quoteQuery = context.supabase
      .from('canonical_supplier_quotations_v1')
      .select('id, quotation_number, request_id, supplier_id, quotation_date, currency, total_amount, lead_time_days, payment_terms, status')
      .eq('organization_id', context.organizationId)
      .eq('status', 'received')
      .order('quotation_date', { ascending: false })
      .limit(100);

    if (requestId) quoteQuery = quoteQuery.eq('request_id', requestId);

    const { data: quotations, error: quoteError } = await quoteQuery;
    if (quoteError) throw quoteError;

    const rows = quotations || [];
    const supplierIds = Array.from(new Set(rows.map((row) => row.supplier_id).filter(Boolean))) as string[];
    const requestIds = Array.from(new Set(rows.map((row) => row.request_id).filter(Boolean))) as string[];

    const [suppliersResult, scoresResult, requestsResult] = await Promise.all([
      supplierIds.length
        ? context.supabase.from('canonical_suppliers_v1').select('id, tax_id, legal_name, trade_name').eq('organization_id', context.organizationId).in('id', supplierIds)
        : Promise.resolve({ data: [], error: null }),
      supplierIds.length
        ? context.supabase.from('supplier_operational_score_v2').select('supplier_id, operational_score, evidence_dimensions, completed_orders, delivery_score, delivery_scored_orders, quality_score, quantity_received, invoice_score, invoice_scored_count, returns_count').eq('organization_id', context.organizationId).in('supplier_id', supplierIds)
        : Promise.resolve({ data: [], error: null }),
      requestIds.length
        ? context.supabase.from('canonical_procurement_requests_v1').select('id, request_number, priority, required_date, status').eq('organization_id', context.organizationId).in('id', requestIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    const firstError = suppliersResult.error || scoresResult.error || requestsResult.error;
    if (firstError) throw firstError;

    const supplierById = new Map((suppliersResult.data || []).map((row) => [row.id, row]));
    const scoreBySupplier = new Map((scoresResult.data || []).map((row) => [row.supplier_id, row]));
    const requestById = new Map((requestsResult.data || []).map((row) => [row.id, row]));

    const evidence = rows.map((quote) => ({
      ...quote,
      supplier: supplierById.get(quote.supplier_id) || null,
      performance: scoreBySupplier.get(quote.supplier_id) || null,
      request: requestById.get(quote.request_id) || null,
    }));

    return NextResponse.json({ evidence });
  } catch (error) {
    console.error('[procurement/award-evidence]', error);
    const message = error instanceof Error ? error.message : 'No se pudo cargar evidencia de adjudicación.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const quotationId = String(body.quotationId || '');
    const primaryReason = String(body.primaryReason || '');
    const decisionNotes = String(body.decisionNotes || '').trim();

    if (!quotationId) return NextResponse.json({ error: 'Cotización requerida.' }, { status: 400 });
    if (!AWARD_REASONS.has(primaryReason)) return NextResponse.json({ error: 'Selecciona un motivo de adjudicación válido.' }, { status: 400 });
    if (primaryReason === 'other' && !decisionNotes) return NextResponse.json({ error: 'Explica el motivo cuando selecciones Otro.' }, { status: 400 });

    const { data: quote, error: quoteError } = await context.supabase
      .from('canonical_supplier_quotations_v1')
      .select('id, organization_id, status')
      .eq('organization_id', context.organizationId)
      .eq('id', quotationId)
      .single();
    if (quoteError || !quote) return NextResponse.json({ error: 'Cotización no encontrada en la organización.' }, { status: 404 });
    if (!['received', 'evaluated'].includes(String(quote.status || ''))) return NextResponse.json({ error: 'La cotización ya no está disponible para adjudicación.' }, { status: 409 });

    const { data, error } = await context.supabase.rpc('award_supplier_quotation_with_decision_v1', {
      p_quotation_id: quotationId,
      p_primary_reason: primaryReason,
      p_decision_notes: decisionNotes || null,
      p_actor_id: context.userId,
    });
    if (error) throw error;

    return NextResponse.json({ purchaseOrderId: data }, { status: 201 });
  } catch (error) {
    console.error('[procurement/award-evidence:post]', error);
    const message = error instanceof Error ? error.message : 'No se pudo adjudicar la cotización.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
