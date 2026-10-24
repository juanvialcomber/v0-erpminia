import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const allowedDecisions = new Set(['accepted', 'rejected', 'deferred']);

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const purchaseInvoiceExternalId = String(body.purchaseInvoiceExternalId || '').trim();
    const suggestedSupplierId = body.suggestedSupplierId
      ? String(body.suggestedSupplierId).trim()
      : null;
    const decision = String(body.decision || '').trim();
    const reason = body.reason ? String(body.reason).trim() : null;
    const priorityScore = Number(body.priorityScore);
    const outstandingAmount = Number(body.outstandingAmount);

    if (!purchaseInvoiceExternalId) {
      return NextResponse.json({ error: 'Documento Laudus requerido.' }, { status: 400 });
    }
    if (!allowedDecisions.has(decision)) {
      return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
    }
    if (decision === 'rejected' && !reason) {
      return NextResponse.json({ error: 'Indica por qué no coincide.' }, { status: 400 });
    }

    const db = getSupabaseServerClient(context.authUserId || context.userId);

    const invoice = await db
      .schema('integration')
      .from('laudus_purchase_invoice_payment_status_v1')
      .select('purchase_invoice_external_id')
      .eq('organization_id', context.organizationId)
      .eq('purchase_invoice_external_id', purchaseInvoiceExternalId)
      .maybeSingle();

    if (invoice.error) throw invoice.error;
    if (!invoice.data) {
      return NextResponse.json({ error: 'Documento Laudus no encontrado.' }, { status: 404 });
    }

    if (suggestedSupplierId) {
      const supplier = await db
        .from('suppliers')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('id', suggestedSupplierId)
        .maybeSingle();

      if (supplier.error) throw supplier.error;
      if (!supplier.data) {
        return NextResponse.json({ error: 'Proveedor sugerido fuera de alcance.' }, { status: 409 });
      }
    }

    const inserted = await db
      .schema('integration')
      .from('laudus_finance_review_feedback')
      .insert({
        organization_id: context.organizationId,
        purchase_invoice_external_id: purchaseInvoiceExternalId,
        suggested_supplier_id: suggestedSupplierId,
        decision,
        reason,
        priority_score: Number.isFinite(priorityScore) ? priorityScore : null,
        outstanding_amount: Number.isFinite(outstandingAmount) ? outstandingAmount : null,
        actor_user_id: context.authUserId || context.userId,
        actor_name: context.userName || context.userEmail || null,
      })
      .select('id,decision,created_at')
      .single();

    if (inserted.error) throw inserted.error;

    return NextResponse.json({
      ok: true,
      feedback: inserted.data,
      canonicalMutated: false,
      paymentMutated: false,
    });
  } catch (error) {
    console.error('[laudus/finance-review/feedback]', error);
    return NextResponse.json(
      { error: 'No fue posible registrar la revisión.' },
      { status: 500 },
    );
  }
}
