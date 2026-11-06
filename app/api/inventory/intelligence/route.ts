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


function stockState(quantity: number, minimum: number) {
  if (quantity < 0) return 'negative';
  if (quantity <= 0) return 'out_of_stock';
  if (minimum > 0 && quantity <= minimum) return 'reorder';
  return 'healthy';
}

function adjustedOverview(
  base: any,
  rows: Array<{ canonical_quantity: number; operational_quantity: number; min_stock: number; unit_cost: number }>,
) {
  const overview = { ...(base || {}) };
  const numericKeys = [
    'products_with_stock',
    'units_on_hand',
    'units_reserved',
    'units_available',
    'total_stock_value',
    'out_of_stock_products',
    'reorder_products',
    'negative_stock_products',
    'expired_products',
    'expiring_products',
    'count_overdue_products',
  ];
  for (const key of numericKeys) overview[key] = Number(overview[key] || 0);

  for (const row of rows) {
    const before = row.canonical_quantity;
    const after = row.operational_quantity;
    const beforeState = stockState(before, row.min_stock);
    const afterState = stockState(after, row.min_stock);

    if (before > 0 && after <= 0) overview.products_with_stock -= 1;
    if (before <= 0 && after > 0) overview.products_with_stock += 1;

    overview.units_on_hand += after - before;
    overview.units_available += after - before;

    for (const [state, key] of [
      ['out_of_stock', 'out_of_stock_products'],
      ['reorder', 'reorder_products'],
      ['negative', 'negative_stock_products'],
    ] as const) {
      if (beforeState === state && afterState !== state) overview[key] -= 1;
      if (beforeState !== state && afterState === state) overview[key] += 1;
    }
  }

  overview.total_stock_value = null;
  return overview;
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

    let missingOperationalQuery = context.supabase
      .from('bodega_inventory_operational_service_v1')
      .select('canonical_product_id,sku,description,unit_of_measure,operational_category,operational_quantity,legacy_motil_quantity,quantity_delta,reconciliation_state,operational_resolution,laudus_stock_date,laudus_synced_at,motil_updated_at')
      .eq('organization_id', organizationId)
      .eq('reconciliation_state', 'missing_in_motil')
      .neq('operational_quantity', 0)
      .order('operational_quantity', { ascending: true })
      .limit(100);

    if (query) {
      missingOperationalQuery = missingOperationalQuery.or(
        `sku.ilike.%${query}%,description.ilike.%${query}%,operational_category.ilike.%${query}%`,
      );
    }
    if (status && status !== 'negative') {
      missingOperationalQuery = missingOperationalQuery.limit(0);
    } else if (status === 'negative') {
      missingOperationalQuery = missingOperationalQuery.lt('operational_quantity', 0);
    }

    const [overviewResult, positionsResult, missingOperationalResult, dieselPositionResult] = await Promise.all([
      context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
      positionsQuery,
      missingOperationalQuery,
      context.supabase
        .from('inventory_intelligence_position_v1')
        .select('stock_id,product_id,product_code,product_name,family,unit,quantity_available,quantity_reserved,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status')
        .eq('organization_id', organizationId)
        .eq('product_code', 'Combustible001')
        .order('last_counted_date', { ascending: false, nullsFirst: false })
        .limit(1),
    ]);

    const initialError = overviewResult.error || positionsResult.error || missingOperationalResult.error || dieselPositionResult.error;
    if (initialError) throw initialError;

    const rawPositions = positionsResult.data || [];
    const rawMissingOperational = missingOperationalResult.data || [];

    const { data: operationalDeltaRows, error: operationalDeltaError } = await context.supabase
      .from('bodega_inventory_operational_service_v1')
      .select('canonical_product_id,operational_quantity,operational_resolution')
      .eq('organization_id', organizationId)
      .in('operational_resolution', ['legacy_motil_stale', 'laudus_only_current']);

    if (operationalDeltaError) throw operationalDeltaError;

    const operationalDeltaIds = [...new Set((operationalDeltaRows || [])
      .map((row: any) => String(row.canonical_product_id || '').trim())
      .filter(Boolean))];

    const canonicalDeltaRows:any[] = [];
    for (let index = 0; index < operationalDeltaIds.length; index += 250) {
      const ids = operationalDeltaIds.slice(index, index + 250);
      const { data: rows, error } = await context.supabase
        .from('canonical_inventory_current')
        .select('id,quantity,min_stock,unit_cost')
        .eq('organization_id', organizationId)
        .in('id', ids);
      if (error) throw error;
      canonicalDeltaRows.push(...(rows || []));
    }

    const operationalDeltaById = new Map(
      (operationalDeltaRows || []).map((row:any) => [String(row.canonical_product_id), num(row.operational_quantity)]),
    );
    const overviewAdjustments = canonicalDeltaRows
      .map((row:any) => ({
        canonical_quantity: num(row.quantity) ?? 0,
        operational_quantity: operationalDeltaById.get(String(row.id)) ?? num(row.quantity) ?? 0,
        min_stock: num(row.min_stock) ?? 0,
        unit_cost: num(row.unit_cost) ?? 0,
      }))
      .filter((row:any) => Math.abs(row.operational_quantity - row.canonical_quantity) > 0.000001);
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

    const operationalPromise = positionSkus.length
      ? context.supabase
          .from('bodega_inventory_operational_service_v1')
          .select('sku,operational_quantity,legacy_motil_quantity,quantity_delta,reconciliation_state,operational_resolution,laudus_stock_date,laudus_synced_at,motil_updated_at')
          .eq('organization_id', organizationId)
          .in('sku', positionSkus)
      : Promise.resolve({ data: [], error: null } as any);

    const [reconciliationResult, operationalResult, dieselLaudusResult, dieselOperationalResult, reconciliationSummaryResult, authorityResult, blockingOperationalResult, legacyContrastResult] = await Promise.all([
      reconciliationPromise,
      operationalPromise,
      context.supabase
        .from('laudus_inventory_reconciliation_service_v1')
        .select('sku,description,unit_of_measure,laudus_stock,stock_position_count,nonzero_stock_position_count,source_date_to,laudus_synced_at,motil_stock,motil_unit_cost,motil_updated_at,quantity_delta,reconciliation_state')
        .eq('organization_id', organizationId)
        .eq('sku', 'COMBUSTIBLE001')
        .maybeSingle(),
      context.supabase
        .from('bodega_inventory_operational_service_v1')
        .select('sku,operational_quantity,legacy_motil_quantity,quantity_delta,reconciliation_state,operational_resolution,laudus_stock_date,laudus_synced_at,motil_updated_at')
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
      context.supabase
        .from('bodega_inventory_operational_service_v1')
        .select('sku', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('operational_resolution', 'review'),
      context.supabase
        .from('bodega_inventory_operational_service_v1')
        .select('sku', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('operational_resolution', 'legacy_motil_stale'),
    ]);

    const reconciliationError = reconciliationResult.error || operationalResult.error || dieselLaudusResult.error || dieselOperationalResult.error || reconciliationSummaryResult.error || authorityResult.error || blockingOperationalResult.error || legacyContrastResult.error;
    if (reconciliationError) throw reconciliationError;

    const authority = authorityResult.data || null;
    const laudusIsPrimary = authority?.authority_state === 'laudus_primary';

    const reconciliationBySku = new Map<string, any>();
    for (const row of reconciliationResult.data || []) {
      const normalized = normalizeReconciliation(row);
      if (normalized?.sku) reconciliationBySku.set(String(normalized.sku).toUpperCase(), normalized);
    }

    const operationalBySku = new Map<string, any>();
    for (const row of operationalResult.data || []) {
      if (row?.sku) operationalBySku.set(String(row.sku).toUpperCase(), row);
    }

    const canonicalPositions = rawPositions.map((row: any) => {
      const sku = String(row.product_code || '').trim().toUpperCase();
      const laudus = reconciliationBySku.get(sku) || null;
      const operational = operationalBySku.get(sku) || null;
      return {
        ...row,
        laudus_stock: laudus?.laudus_stock ?? null,
        laudus_synced_at: laudus?.laudus_synced_at ?? null,
        laudus_source_date_to: laudus?.source_date_to ?? null,
        laudus_quantity_delta: laudus?.quantity_delta ?? null,
        laudus_reconciliation_state: laudus?.reconciliation_state ?? 'not_in_laudus',
        laudus_stock_position_count: laudus?.stock_position_count ?? 0,
        operational_resolution: operational?.operational_resolution ?? null,
        operational_quantity: num(operational?.operational_quantity),
        legacy_motil_quantity: num(operational?.legacy_motil_quantity),
        operational_stock_date: operational?.laudus_stock_date ?? null,
        effective_quantity: laudusIsPrimary && laudus?.laudus_stock != null
          ? laudus.laudus_stock
          : row.quantity_available,
        effective_source: laudusIsPrimary && laudus?.laudus_stock != null
          ? 'laudus'
          : 'motil',
        source_authority_state: authority?.authority_state || 'review_laudus_unavailable',
      };
    });

    const canonicalSkus = new Set(
      canonicalPositions.map((row: any) => String(row.product_code || '').trim().toUpperCase()).filter(Boolean),
    );
    const missingOperationalPositions = laudusIsPrimary
      ? rawMissingOperational
          .filter((row: any) => row?.canonical_product_id && row?.sku)
          .filter((row: any) => !canonicalSkus.has(String(row.sku).trim().toUpperCase()))
          .map((row: any) => {
            const quantity = num(row.operational_quantity) ?? 0;
            const sku = String(row.sku || '').trim();
            return {
              stock_id: `laudus:${row.canonical_product_id}`,
              product_id: row.canonical_product_id,
              product_code: sku,
              product_name: String(row.description || sku),
              family: row.operational_category || null,
              unit: row.unit_of_measure || null,
              quantity_available: quantity,
              quantity_reserved: 0,
              unit_cost: null,
              stock_value: null,
              stock_status: quantity < 0 ? 'negative' : quantity === 0 ? 'out_of_stock' : 'healthy',
              last_counted_date: null,
              warehouse_code: null,
              validation_status: 'laudus_primary',
              laudus_stock: quantity,
              laudus_synced_at: row.laudus_synced_at ?? null,
              laudus_source_date_to: row.laudus_stock_date ?? null,
              laudus_quantity_delta: num(row.quantity_delta),
              laudus_reconciliation_state: row.reconciliation_state ?? 'missing_in_motil',
              laudus_stock_position_count: 0,
              operational_resolution: row.operational_resolution ?? 'laudus_only_current',
              operational_quantity: quantity,
              legacy_motil_quantity: num(row.legacy_motil_quantity),
              operational_stock_date: row.laudus_stock_date ?? null,
              effective_quantity: quantity,
              effective_source: 'laudus',
              source_authority_state: authority?.authority_state || 'review_laudus_unavailable',
            };
          })
      : [];

    const positions = [...canonicalPositions, ...missingOperationalPositions].slice(0, 200);

    const currentDiesel = dieselPositionResult.data?.[0] || null;
    const dieselLaudus = normalizeReconciliation(dieselLaudusResult.data || null);
    const dieselOperational = dieselOperationalResult.data || null;
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
      overview: adjustedOverview(overviewResult.data || null, overviewAdjustments),
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
        operationalResolution: dieselOperational?.operational_resolution ?? null,
      } : null,
      reconciliationSummary: summary,
      operationalDifferenceSummary: {
        blockingReviews: Number(blockingOperationalResult.count || 0),
        legacyMotilStale: Number(legacyContrastResult.count || 0),
        authorityState: authority?.authority_state || 'review_laudus_unavailable',
      },
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
      valuation: {
        trusted: false,
        state: 'review',
        reason: 'Las cantidades operativas usan Laudus primario, pero los costos de Bodega siguen pendientes de conciliación completa.',
      },
      source: 'public.inventory_intelligence_position_v1 + public.laudus_inventory_reconciliation_service_v1 + public.bodega_inventory_operational_service_v1 + public.bodega_stock_source_authority_service_v1',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el inventario canónico';
    console.error('[inventory/intelligence]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
