import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const allowedDecisions = new Set(['accepted', 'rejected', 'deferred']);

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const supplierNameKey = String(body.supplierNameKey || '').trim();
    const proposedCanonicalSupplierId = body.proposedCanonicalSupplierId
      ? String(body.proposedCanonicalSupplierId).trim()
      : null;
    const decision = String(body.decision || '').trim();
    const reason = body.reason ? String(body.reason).trim() : null;

    if (!supplierNameKey || !proposedCanonicalSupplierId) {
      return NextResponse.json({ error: 'Candidato de proveedor requerido.' }, { status: 400 });
    }
    if (!allowedDecisions.has(decision)) {
      return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
    }
    if (decision === 'rejected' && !reason) {
      return NextResponse.json({ error: 'Indica por qué no coincide.' }, { status: 400 });
    }

    const db = getSupabaseServerClient(context.authUserId || context.userId);

    const candidate = await db
      .from('laudus_supplier_bridge_candidates_service_v1')
      .select('supplier_name_key,proposed_canonical_supplier_id,resolution_status')
      .eq('organization_id', context.organizationId)
      .eq('supplier_name_key', supplierNameKey)
      .maybeSingle();

    if (candidate.error) throw candidate.error;
    if (!candidate.data) {
      return NextResponse.json({ error: 'Candidato no encontrado.' }, { status: 404 });
    }
    if (candidate.data.resolution_status !== 'tax_verified_exact') {
      return NextResponse.json({ error: 'El candidato no tiene RUT verificado.' }, { status: 409 });
    }
    if (candidate.data.proposed_canonical_supplier_id !== proposedCanonicalSupplierId) {
      return NextResponse.json({ error: 'El candidato cambió. Recarga antes de revisar.' }, { status: 409 });
    }

    const inserted = await db.rpc('motil_record_laudus_supplier_bridge_review', {
      p_organization_id: context.organizationId,
      p_supplier_name_key: supplierNameKey,
      p_proposed_canonical_supplier_id: proposedCanonicalSupplierId,
      p_decision: decision,
      p_reason: reason,
      p_actor_user_id: context.authUserId || context.userId,
      p_actor_name: context.userName || context.userEmail || null,
    });

    if (inserted.error) throw inserted.error;

    return NextResponse.json({
      ok: true,
      review: {
        id: inserted.data,
        decision,
      },
      canonicalMutated: false,
      purchaseOrdersMutated: false,
    });
  } catch (error) {
    console.error('[laudus/supplier-bridge/review]', error);
    return NextResponse.json(
      { error: 'No fue posible registrar la revisión del proveedor.' },
      { status: 500 },
    );
  }
}
