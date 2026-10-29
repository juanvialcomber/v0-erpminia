export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function num(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeReconciliation(row: any) {
  if (!row) return null;
  return {
    ...row,
    laudus_stock: num(row.laudus_stock),
    motil_stock: num(row.motil_stock),
    motil_unit_cost: num(row.motil_unit_cost),
    quantity_delta: num(row.quantity_delta),
    stock_position_count: num(row.stock_position_count) ?? 0,
    nonzero_stock_position_count: num(row.nonzero_stock_position_count) ?? 0,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const organizationId = context.organizationId;
    const query = request.nextUrl.searchParams.get('q')?.trim() || '';
    const status = request.nextUrl.searchParams.get('status')?.trim() || '';

    let positionsQuery = context.supabase
      .from('inventory_intelligence_position_v1')
      .select('*')
      .eq('organization_id', organizationId)
      .order('stock_value', { ascending: false })
      .limit(200);

    if (status) positionsQuery = positionsQuery.eq('stock_status', status);
    if (query) positionsQuery = positionsQuery.or(`product_code.ilike.%${query}%,product_name.ilike.%${query}%`);

    const [overviewResult, positionsResult, dieselPositionResult] = await Promise.all([
      context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
      positionsQuery,
      context.supabase
        .from('inventory_intelligence_position_v1')
        .select('stock_id,product_id,product_code,product_name,family,unit,quantity_available,quantity_reserved,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status')
        .eq('organization_id', organizationId)
        .eq('product_code', 'Combustible001')
        .order('last_counted_date', { ascending: false, nullsFirst: false })
        .limit(1),
    ]);

    const initialError = overviewResult.error || positionsResult.error || dieselPositionResult.error;
    if (initialError) throw initialError;

    const rawPositions = positionsResult.data || [];
    const positionSkus = [...new Set(
      rawPositions
        .map((row: any) => String(row.product_code || '').trim().toUpperCase())
        .filter(Boolean),
    )];

    const reconciliationPromise = positionSkus.length
      ? context.supabase
          .from('laudus_inventory_reconciliation_service_v1')
          .select('sku,description,unit_of_measure,laudus_stock,stock_position_count,nonzero_stock_position_count,source_date_to,laudus_synced_at,motil_stock,motil_unit_cost,motil_updated_at,quantity_delta,reconciliation_state')
          .eq('organization_id', organizationId)
          .in('sku', positionSkus)
      : Promise.resolve({ data: [], error: null } as any);

    const [reconciliationResult, dieselLaudusResult, reconciliationSummaryResult, authorityResult] = await Promise.all([
      reconciliationPromise,
      context.supabase
        .from('laudus_inventory_reconciliation_service_v1')
        .select('sku,description,unit_of_measure,laudus_stock,stock_position_count,nonzero_stock_position_count,source_date_to,laudus_synced_at,motil_stock,motil_unit_cost,motil_updated_at,quantity_delta,reconciliation_state')
        .eq('organization_id', organizationId)
        .eq('sku', 'COMBUSTIBLE001')
        .maybeSingle(),
      context.supabase
        .from('laudus_inventory_reconciliation_summary_service_v1')
        .select('compared_products,aligned_products,quantity_mismatches,missing_in_motil_nonzero,laudus_only_zero,laudus_negative_products,latest_laudus_stock_sync,latest_motil_stock_update')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      context.supabase
        .from('bodega_stock_source_authority_service_v1')
        .select('authority_state,authority_reason,latest_laudus_stock_sync,latest_laudus_stock_date,latest_email_stock_cutoff,latest_email_pending_reconciliation,latest_whatsapp_stock_evidence,whatsapp_stock_evidence_since_laudus')
        .eq('organization_id', organizationId)
        .maybeSingle(),
    ]);

    const reconciliationError = reconciliationResult.error || dieselLaudusResult.error || reconciliationSummaryResult.error || authorityResult.error;
    if (reconciliationError) throw reconciliationError;

    const authority = authorityResult.data || null;
    const laudusIsPrimary = authority?.authority_state === 'laudus_primary';

    const reconciliationBySku = new Map<string, any>();
    for (const row of reconciliationResult.data || []) {
      const normalized = normalizeReconciliation(row);
      if (normalized?.sku) reconciliationBySku.set(String(normalized.sku).toUpperCase(), normalized);
    }

    const positions = rawPositions.map((row: any) => {
      const sku = String(row.product_code || '').trim().toUpperCase();
      const laudus = reconciliationBySku.get(sku) || null;
      return {
        ...row,
        laudus_stock: laudus?.laudus_stock ?? null,
        laudus_synced_at: laudus?.laudus_synced_at ?? null,
        laudus_source_date_to: laudus?.source_date_to ?? null,
        laudus_quantity_delta: laudus?.quantity_delta ?? null,
        laudus_reconciliation_state: laudus?.reconciliation_state ?? 'not_in_laudus',
        laudus_stock_position_count: laudus?.stock_position_count ?? 0,
        effective_quantity: laudusIsPrimary && laudus?.laudus_stock != null
          ? laudus.laudus_stock
          : row.quantity_available,
        effective_source: laudusIsPrimary && laudus?.laudus_stock != null
          ? 'laudus'
          : 'motil',
        source_authority_state: authority?.authority_state || 'review_laudus_unavailable',
      };
    });

    const currentDiesel = dieselPositionResult.data?.[0] || null;
    const dieselLaudus = normalizeReconciliation(dieselLaudusResult.data || null);
    const dieselSourcesDiffer = Boolean(currentDiesel || dieselLaudus) && (
      !currentDiesel ||
      !dieselLaudus ||
      dieselLaudus.reconciliation_state !== 'aligned'
    );
    const hasDieselConflict = !laudusIsPrimary && dieselSourcesDiffer;

    const summary = reconciliationSummaryResult.data
      ? {
          comparedProducts: Number(reconciliationSummaryResult.data.compared_products || 0),
          alignedProducts: Number(reconciliationSummaryResult.data.aligned_products || 0),
          quantityMismatches: Number(reconciliationSummaryResult.data.quantity_mismatches || 0),
          missingInMotilNonzero: Number(reconciliationSummaryResult.data.missing_in_motil_nonzero || 0),
          laudusOnlyZero: Number(reconciliationSummaryResult.data.laudus_only_zero || 0),
          laudusNegativeProducts: Number(reconciliationSummaryResult.data.laudus_negative_products || 0),
          latestLaudusStockSync: reconciliationSummaryResult.data.latest_laudus_stock_sync || null,
          latestMotilStockUpdate: reconciliationSummaryResult.data.latest_motil_stock_update || null,
        }
      : null;

    return NextResponse.json({
      overview: overviewResult.data || null,
      positions,
      diesel: currentDiesel || dieselLaudus ? {
        current: currentDiesel,
        laudus: dieselLaudus,
        hasConflict: hasDieselConflict,
        sourcesDiffer: dieselSourcesDiffer,
        effectiveQuantity: laudusIsPrimary && dieselLaudus?.laudus_stock != null
          ? dieselLaudus.laudus_stock
          : currentDiesel?.quantity_available ?? null,
        effectiveSource: laudusIsPrimary && dieselLaudus?.laudus_stock != null ? 'laudus' : 'motil',
      } : null,
      reconciliationSummary: summary,
      sourceAuthority: authority ? {
        state: authority.authority_state,
        reason: authority.authority_reason,
        laudusIsPrimary,
        latestLaudusStockSync: authority.latest_laudus_stock_sync,
        latestLaudusStockDate: authority.latest_laudus_stock_date,
        latestEmailStockCutoff: authority.latest_email_stock_cutoff,
        latestEmailPendingReconciliation: Number(authority.latest_email_pending_reconciliation || 0),
        latestWhatsappStockEvidence: authority.latest_whatsapp_stock_evidence,
        whatsappStockEvidenceSinceLaudus: Number(authority.whatsapp_stock_evidence_since_laudus || 0),
      } : null,
      source: 'public.inventory_intelligence_position_v1 + public.laudus_inventory_reconciliation_service_v1 + public.bodega_stock_source_authority_service_v1',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el inventario canónico';
    console.error('[inventory/intelligence]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
