export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import {
  getUserModuleAccess,
  isAdminRole,
  MODULE_KEYS,
  requireModuleAccess,
} from '@/lib/api/module-access';

type Decision = 'approve' | 'reject';

function normalize(value: unknown) {
  return String(value ?? '').trim().toLowerCase();
}

async function canDecideBodega(userId: string, role?: string | null) {
  if (isAdminRole(role)) return true;
  const access = await getUserModuleAccess(userId);
  return normalize(access.cargoName) === 'jefe bodega';
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: reviews, error } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,entity_id,issue_type,status,evidence_reference,created_at,updated_at')
      .eq('organization_id', context.organizationId)
      .eq('status', 'open')
      .or('issue_key.like.laudus:inventory_mismatch:%,issue_key.like.laudus:negative_stock:%')
      .order('updated_at', { ascending: false })
      .limit(100);

    if (error) throw error;

    const productIds = [...new Set((reviews || []).map((row) => row.entity_id).filter(Boolean))] as string[];

    const [mismatches, negatives] = await Promise.all([
      productIds.length
        ? context.supabase
            .from('laudus_inventory_reconciliation_service_v1')
            .select('canonical_product_id,sku,description,unit_of_measure,operational_category,laudus_stock,motil_stock,quantity_delta,laudus_synced_at,motil_updated_at,reconciliation_state')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
      productIds.length
        ? context.supabase
            .from('laudus_negative_stock_positions_service_v1')
            .select('canonical_product_id,sku,description,unit_of_measure,total_laudus_stock,warehouse_name,warehouse_stock,synced_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (mismatches.error) throw mismatches.error;
    if (negatives.error) throw negatives.error;

    const mismatchByProduct = new Map((mismatches.data || []).map((row) => [row.canonical_product_id, row]));
    const negativeByProduct = new Map<string, any[]>();
    for (const row of negatives.data || []) {
      const current = negativeByProduct.get(row.canonical_product_id) || [];
      current.push(row);
      negativeByProduct.set(row.canonical_product_id, current);
    }

    const rows = (reviews || []).map((review) => {
      const mismatch = review.entity_id ? mismatchByProduct.get(review.entity_id) : null;
      const negativePositions = review.entity_id ? (negativeByProduct.get(review.entity_id) || []) : [];
      const kind = review.issue_key.startsWith('laudus:negative_stock:') ? 'negative_stock' : 'inventory_mismatch';
      const firstNegative = negativePositions[0] || null;
      return {
        id: review.id,
        kind,
        issueType: review.issue_type,
        productId: review.entity_id,
        sku: mismatch?.sku || firstNegative?.sku || null,
        description: mismatch?.description || firstNegative?.description || null,
        unit: mismatch?.unit_of_measure || firstNegative?.unit_of_measure || null,
        operationalCategory: mismatch?.operational_category || null,
        laudusStock: mismatch?.laudus_stock ?? firstNegative?.total_laudus_stock ?? null,
        motilStock: mismatch?.motil_stock ?? null,
        delta: mismatch?.quantity_delta ?? null,
        laudusSyncedAt: mismatch?.laudus_synced_at || firstNegative?.synced_at || null,
        motilUpdatedAt: mismatch?.motil_updated_at || null,
        reconciliationState: mismatch?.reconciliation_state || null,
        negativePositions,
        evidenceReference: review.evidence_reference,
        updatedAt: review.updated_at,
      };
    });

    const canDecide = access.canWrite && await canDecideBodega(context.userId, context.role);

    return NextResponse.json({
      rows,
      canDecide,
      summary: {
        pending: rows.length,
        mismatches: rows.filter((row) => row.kind === 'inventory_mismatch').length,
        negativeStock: rows.filter((row) => row.kind === 'negative_stock').length,
      },
      decisionPolicy: {
        approve: 'Aceptar la evidencia Laudus para este caso. No modifica stock automáticamente.',
        reject: 'Rechazar la evidencia Laudus para este caso. Requiere motivo y no modifica stock automáticamente.',
        reasonRequired: true,
        autoWrite: false,
      },
    });
  } catch (error) {
    console.error('[laudus/inventory-reconciliation-review][GET]', error);
    return NextResponse.json({ error: 'No fue posible cargar la cola de conciliación.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  if (!(await canDecideBodega(context.userId, context.role))) {
    return NextResponse.json(
      { error: 'Sólo el Jefe de Bodega o un administrador puede resolver esta conciliación.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => null);
  const reviewId = String(body?.reviewId || '').trim();
  const decision = String(body?.decision || '').trim() as Decision;
  const reason = String(body?.reason || '').trim();

  if (!reviewId || !['approve', 'reject'].includes(decision)) {
    return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
  }
  if (reason.length < 5) {
    return NextResponse.json({ error: 'Debes registrar una razón concreta para aprobar o rechazar.' }, { status: 400 });
  }

  try {
    const { data: review, error: loadError } = await context.supabase
      .from('data_reconciliation_reviews')
      .select('id,issue_key,status')
      .eq('organization_id', context.organizationId)
      .eq('id', reviewId)
      .maybeSingle();

    if (loadError) throw loadError;
    if (!review) return NextResponse.json({ error: 'Conciliación no encontrada.' }, { status: 404 });
    if (review.status !== 'open') return NextResponse.json({ error: 'Esta conciliación ya fue resuelta.' }, { status: 409 });
    if (!String(review.issue_key).startsWith('laudus:inventory_mismatch:') && !String(review.issue_key).startsWith('laudus:negative_stock:')) {
      return NextResponse.json({ error: 'La conciliación no pertenece a Bodega Laudus.' }, { status: 400 });
    }

    const status = decision === 'approve' ? 'accepted' : 'ignored';
    const actor = context.userName || context.userEmail || context.userId;
    const resolutionNote = [
      `decision=${decision}`,
      'area=bodega',
      `actor=${actor}`,
      `reason=${reason}`,
      'auto_write=false',
    ].join(' | ');

    const { error: updateError } = await context.supabase
      .from('data_reconciliation_reviews')
      .update({
        status,
        resolution_note: resolutionNote,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)
      .eq('id', reviewId)
      .eq('status', 'open');

    if (updateError) throw updateError;

    return NextResponse.json({
      ok: true,
      reviewId,
      decision,
      status,
      autoWrite: false,
      message: decision === 'approve'
        ? 'Evidencia Laudus aprobada y registrada para este caso.'
        : 'Evidencia Laudus rechazada y motivo registrado para este caso.',
    });
  } catch (error) {
    console.error('[laudus/inventory-reconciliation-review][POST]', error);
    return NextResponse.json({ error: 'No fue posible registrar la decisión.' }, { status: 500 });
  }
}
