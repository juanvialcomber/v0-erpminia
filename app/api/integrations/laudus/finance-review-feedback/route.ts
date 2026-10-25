export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const decisions = new Set(['accepted', 'rejected', 'deferred']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const result = await context.supabase
    .from('laudus_finance_review_feedback_service_v1')
    .select('purchase_invoice_external_id,decision,reason,actor_name,created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: false })
    .limit(500);

  if (result.error) {
    console.error('[laudus/finance-review-feedback:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar las revisiones.' }, { status: 500 });
  }

  const latestByInvoice = new Map<string, any>();
  for (const row of result.data || []) {
    const key = String(row.purchase_invoice_external_id || '');
    if (key && !latestByInvoice.has(key)) latestByInvoice.set(key, row);
  }

  return NextResponse.json({
    reviews: Array.from(latestByInvoice.values()),
    uniqueInvoices: latestByInvoice.size,
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const purchaseInvoiceExternalId =
    typeof body?.purchaseInvoiceExternalId === 'string'
      ? body.purchaseInvoiceExternalId.trim()
      : '';
  const decision = typeof body?.decision === 'string' ? body.decision.trim() : '';
  const reason = typeof body?.reason === 'string' ? body.reason.trim().slice(0, 1000) : '';

  if (!purchaseInvoiceExternalId || !decisions.has(decision)) {
    return NextResponse.json({ error: 'Factura y decisión válidas son requeridas.' }, { status: 400 });
  }
  if (decision === 'rejected' && !reason) {
    return NextResponse.json({ error: 'Indica por qué esta prioridad no aplica.' }, { status: 400 });
  }

  const outstandingAmount =
    typeof body?.outstandingAmount === 'number' && Number.isFinite(body.outstandingAmount)
      ? body.outstandingAmount
      : null;
  const decisionLatencyMs =
    typeof body?.decisionLatencyMs === 'number' &&
    Number.isFinite(body.decisionLatencyMs) &&
    body.decisionLatencyMs >= 0 &&
    body.decisionLatencyMs <= 30 * 60 * 1000
      ? Math.round(body.decisionLatencyMs)
      : null;

  const result = await context.supabase.rpc('motil_record_laudus_finance_review_feedback', {
    p_organization_id: context.organizationId,
    p_purchase_invoice_external_id: purchaseInvoiceExternalId,
    p_suggested_supplier_id: null,
    p_decision: decision,
    p_reason: reason || null,
    p_priority_score: null,
    p_outstanding_amount: outstandingAmount,
    p_actor_user_id: context.userId,
    p_actor_name: context.userName || context.userEmail || null,
  });

  if (result.error) {
    console.error('[laudus/finance-review-feedback]', result.error);
    return NextResponse.json(
      { error: 'No fue posible registrar la revisión.' },
      { status: 409 },
    );
  }

  if (decisionLatencyMs !== null) {
    const telemetry = await context.supabase.from('audit_log').insert({
      organization_id: context.organizationId,
      user_id: context.userId,
      action: 'finance_review_decision',
      resource_type: 'laudus_purchase_invoice',
      resource_identifier: purchaseInvoiceExternalId,
      new_values: {
        decision,
        decision_latency_ms: decisionLatencyMs,
        outstanding_amount: outstandingAmount,
        metric_version: 'finance-review-v1',
        semantics: 'time from finance cockpit load to human decision; not manual baseline',
      },
      user_agent: request.headers.get('user-agent'),
      status: 'completed',
    });

    if (telemetry.error) {
      console.warn('[laudus/finance-review-feedback:telemetry]', telemetry.error);
    }
  }

  return NextResponse.json({
    id: result.data,
    decision,
    authority: 'human_review_only',
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
  });
}
