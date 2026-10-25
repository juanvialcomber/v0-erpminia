export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const decisions = new Set(['accepted', 'rejected', 'deferred']);

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

  return NextResponse.json({
    id: result.data,
    decision,
    authority: 'human_review_only',
    canonicalMutationExecuted: false,
    laudusMutationExecuted: false,
  });
}
