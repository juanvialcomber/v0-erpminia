export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

type Product = {
  id: string;
  product_code: string | null;
  name: string | null;
  family: string | null;
  unit: string | null;
};

type CentralStockObservation = {
  canonical_product_id: string;
  laudus_stock: number | string | null;
  product_reconciliation_status: string | null;
  reconciliation_state: string | null;
  source_date_to: string | null;
  laudus_synced_at: string | null;
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (access !== 'LEC' && access !== 'ED') {
    return NextResponse.json({ error: 'Acceso a Mantención no autorizado para este usuario' }, { status: 403 });
  }

  const raw = request.nextUrl.searchParams.get('q')?.trim() || '';
  // PostgREST .or uses commas and parentheses as syntax; never insert a
  // search term containing those control characters into a filter expression.
  const safe = raw.slice(0, 80).replace(/[%_,().*"\\]/g, ' ').replace(/\s+/g, ' ').trim();
  if (safe.length < 2) return NextResponse.json({ rows: [] });

  try {
    // Catalog identity must come from the product master. In particular,
    // inventory_intelligence_position_v1 derives "quantity_available" from
    // legacy inventory snapshots without deducting reservations. It is NOT
    // an authoritative source of stock free for an OT.
    const { data: productData, error: productError } = await context.supabase
      .from('canonical_products_v1')
      .select('id,product_code,name,family,unit')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true)
      .or(`product_code.ilike.%${safe}%,name.ilike.%${safe}%`)
      .limit(80);
    if (productError) throw productError;

    const products = (productData || []) as Product[];
    const productIds = [...new Set(products.map((product) => product.id).filter(Boolean))];
    const observations = new Map<string, CentralStockObservation[]>();
    let stockEvidenceAvailable = true;

    if (productIds.length) {
      const { data: stockData, error: stockError } = await context.supabase
        .from('laudus_central_warehouse_stock_reconciliation_v1')
        .select('canonical_product_id,laudus_stock,product_reconciliation_status,reconciliation_state,source_date_to,laudus_synced_at')
        .eq('organization_id', context.organizationId)
        .in('canonical_product_id', productIds)
        .limit(300);
      if (stockError) {
        // The material master may still be searched when Laudus is unavailable.
        // Degrade to unknown reference stock, never to zero/free availability.
        stockEvidenceAvailable = false;
        console.error('[maintenance/material-catalog] No se pudo consultar el corte Laudus Central', {
          code: stockError.code || 'UNKNOWN',
        });
      } else {
        for (const item of (stockData || []) as CentralStockObservation[]) {
          if (!item.canonical_product_id) continue;
          const matches = observations.get(item.canonical_product_id) || [];
          matches.push(item);
          observations.set(item.canonical_product_id, matches);
        }
      }
    }

    const needle = safe.toLowerCase();
    const rows = products.map((product) => {
      const matches = observations.get(product.id) || [];
      const conflict = matches.length > 1 ||
        matches.some((item) => item.product_reconciliation_status === 'identity_conflict');
      const observation = !conflict ? matches[0] || null : null;
      const quantity = observation?.laudus_stock == null ? null : Number(observation.laudus_stock);
      return {
        productId: product.id,
        productCode: product.product_code || null,
        productName: product.name || null,
        family: product.family || null,
        unit: product.unit || null,
        // Observed Laudus Central (002) source only: never "available"/reserved.
        observedLaudusQuantity: quantity != null && Number.isFinite(quantity) ? quantity : null,
        stockReconciliationState: conflict ? 'review_identity_conflict'
          : !stockEvidenceAvailable ? 'source_unavailable'
          : observation?.reconciliation_state || 'not_linked',
        stockSourceDate: observation?.source_date_to || null,
        stockSyncedAt: observation?.laudus_synced_at || null,
      };
    }).sort((a, b) => {
      const aCode = (a.productCode || '').toLowerCase();
      const bCode = (b.productCode || '').toLowerCase();
      const rank = (code: string) => code === needle ? 0 : code.startsWith(needle) ? 1 : 2;
      return rank(aCode) - rank(bCode) ||
        (a.productName || '').localeCompare(b.productName || '', 'es');
    }).slice(0, 20);

    return NextResponse.json({
      rows,
      stockEvidenceAvailable,
      source: 'canonical_products_v1 / Laudus Bodega Central (002)',
      stockQuantityMeaning: 'La cantidad Laudus es referencia sin conteo físico; no representa stock disponible para reservar o entregar.',
    });
  } catch (error) {
    const details = error && typeof error === 'object'
      ? error as { code?: string; message?: string }
      : null;
    console.error('[maintenance/material-catalog][GET]', {
      code: details?.code || 'UNKNOWN',
      message: details?.message || 'No se pudo consultar el catálogo',
    });
    return NextResponse.json({ error: 'No se pudo buscar el catálogo de materiales.' }, { status: 500 });
  }
}
