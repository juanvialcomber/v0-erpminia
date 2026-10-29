export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const DECISIONS = new Set([
  'saldo_correcto',
  'falta_movimiento',
  'ajuste_laudus',
  'reponer',
  'no_aplica',
]);

function num(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function issueKey(sku: string) {
  return `inventory_negative:${sku.trim().toUpperCase()}`;
}

function parseResolutionNote(value: unknown) {
  if (!value || typeof value !== 'string') return { decision: null, note: null };
  try {
    const parsed = JSON.parse(value);
    return {
      decision: typeof parsed?.decision === 'string' ? parsed.decision : null,
      note: typeof parsed?.note === 'string' ? parsed.note : null,
    };
  } catch {
    return { decision: null, note: value };
  }
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: negativeRows, error: negativeError } = await context.supabase
    .from('laudus_inventory_reconciliation_service_v1')
    .select('canonical_product_id,sku,description,unit_of_measure,laudus_stock,laudus_synced_at,motil_stock,quantity_delta,reconciliation_state')
    .eq('organization_id', context.organizationId)
    .lt('laudus_stock', 0)
    .order('laudus_stock', { ascending: true })
    .limit(50);

  if (negativeError) {
    return NextResponse.json({ error: 'No se pudieron cargar las excepciones de stock Laudus' }, { status: 500 });
  }

  const skus = [...new Set((negativeRows || []).map((row: any) => String(row.sku || '').trim()).filter(Boolean))];
  const productIds = [...new Set((negativeRows || []).map((row: any) => String(row.canonical_product_id || '').trim()).filter(Boolean))];
  if (!skus.length) {
    return NextResponse.json({
      decisions: [],
      summary: { actionable: 0, reviewed: 0, exposureClp: 0, top3ExposureClp: 0 },
      semantics: 'La exposición es una estimación de reposición basada en costo histórico promedio; no representa pérdida ni ahorro realizado.',
    });
  }

  const keys = skus.map(issueKey);
  const [procurementResult, reviewsResult] = await Promise.all([
    context.supabase
      .from('product_procurement_status')
      .select('product_id,product_code,name,has_purchase_history,purchase_order_count,total_spend,weighted_average_unit_cost,minimum_unit_cost,maximum_unit_cost,last_purchase_date')
      .eq('organization_id', context.organizationId)
      .in('product_id', productIds.length ? productIds : ['00000000-0000-0000-0000-000000000000']),
    context.supabase
      .from('data_reconciliation_reviews')
      .select('issue_key,status,resolution_note,evidence_reference,reviewed_by,reviewed_at,updated_at')
      .eq('organization_id', context.organizationId)
      .in('issue_key', keys),
  ]);

  if (procurementResult.error || reviewsResult.error) {
    return NextResponse.json({ error: 'No se pudo construir la prioridad económica de Bodega' }, { status: 500 });
  }

  const procurementByProductId = new Map(
    (procurementResult.data || []).map((row: any) => [String(row.product_id || ''), row]),
  );
  const reviewByKey = new Map(
    (reviewsResult.data || []).map((row: any) => [String(row.issue_key), row]),
  );

  const decisions = (negativeRows || []).map((row: any) => {
    const sku = String(row.sku || '').trim();
    const procurement = procurementByProductId.get(String(row.canonical_product_id || '')) || null;
    const review = reviewByKey.get(issueKey(sku)) || null;
    const stock = num(row.laudus_stock) || 0;
    const unitCost = num(procurement?.weighted_average_unit_cost);
    const exposureClp = unitCost != null ? Math.abs(stock) * unitCost : null;
    const parsedReview = parseResolutionNote(review?.resolution_note);
    const reviewedAt = review?.reviewed_at || null;
    const syncedAt = row.laudus_synced_at || null;
    const staleReview = Boolean(reviewedAt && syncedAt && new Date(syncedAt).getTime() > new Date(reviewedAt).getTime());

    return {
      sku,
      productId: procurement?.product_id || null,
      description: row.description || procurement?.name || sku,
      unit: row.unit_of_measure || null,
      laudusStock: stock,
      motilStock: num(row.motil_stock),
      quantityDelta: num(row.quantity_delta),
      reconciliationState: row.reconciliation_state || null,
      laudusSyncedAt: syncedAt,
      hasPurchaseHistory: Boolean(procurement?.has_purchase_history),
      purchaseOrderCount: Number(procurement?.purchase_order_count || 0),
      historicalSpendClp: num(procurement?.total_spend),
      weightedUnitCostClp: unitCost,
      minUnitCostClp: num(procurement?.minimum_unit_cost),
      maxUnitCostClp: num(procurement?.maximum_unit_cost),
      lastPurchaseDate: procurement?.last_purchase_date || null,
      exposureClp,
      review: review ? {
        status: review.status,
        decision: parsedReview.decision,
        note: parsedReview.note,
        reviewedAt,
        stale: staleReview,
      } : null,
    };
  }).sort((a: any, b: any) => {
    const ax = a.exposureClp == null ? -1 : a.exposureClp;
    const bx = b.exposureClp == null ? -1 : b.exposureClp;
    return bx - ax || Math.abs(b.laudusStock) - Math.abs(a.laudusStock);
  });

  const exposureClp = decisions.reduce((sum: number, row: any) => sum + (row.exposureClp || 0), 0);
  const top3ExposureClp = decisions.slice(0, 3).reduce((sum: number, row: any) => sum + (row.exposureClp || 0), 0);
  const reviewed = decisions.filter((row: any) => row.review && !row.review.stale).length;

  return NextResponse.json({
    decisions,
    summary: {
      actionable: decisions.length,
      reviewed,
      exposureClp,
      top3ExposureClp,
    },
    semantics: 'La exposición es una estimación de reposición basada en costo histórico promedio; no representa pérdida ni ahorro realizado.',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const sku = String(body?.sku || '').trim();
  const decision = String(body?.decision || '').trim();
  const note = String(body?.note || '').trim().slice(0, 500);

  if (!sku || !DECISIONS.has(decision)) {
    return NextResponse.json({ error: 'Decisión de inventario inválida' }, { status: 400 });
  }

  const { data: current, error: currentError } = await context.supabase
    .from('laudus_inventory_reconciliation_service_v1')
    .select('canonical_product_id,sku,laudus_stock,laudus_synced_at')
    .eq('organization_id', context.organizationId)
    .eq('sku', sku)
    .lt('laudus_stock', 0)
    .maybeSingle();

  if (currentError) return NextResponse.json({ error: 'No se pudo validar el saldo actual' }, { status: 500 });
  if (!current) {
    return NextResponse.json({ error: 'La excepción ya no está activa; actualiza Bodega antes de decidir' }, { status: 409 });
  }

  const now = new Date().toISOString();
  const status = decision === 'no_aplica' ? 'ignored' : 'accepted';
  const resolutionNote = JSON.stringify({ decision, note: note || null });
  const evidenceReference = JSON.stringify({
    source: 'laudus_inventory_reconciliation_service_v1',
    sku,
    stock: num(current.laudus_stock),
    syncedAt: current.laudus_synced_at || null,
  });

  const { error } = await context.supabase
    .from('data_reconciliation_reviews')
    .upsert({
      organization_id: context.organizationId,
      issue_key: issueKey(sku),
      entity_type: 'inventory',
      entity_id: current.canonical_product_id || null,
      issue_type: 'negative_stock',
      field_name: 'stock',
      status,
      resolution_note: resolutionNote,
      evidence_reference: evidenceReference,
      reviewed_by: context.userId,
      reviewed_at: now,
      updated_at: now,
    }, { onConflict: 'organization_id,issue_key' });

  if (error) {
    console.error('[inventory/negative-stock-decisions]', error);
    return NextResponse.json({ error: 'No se pudo registrar la decisión' }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sku, decision, status, reviewedAt: now });
}
