export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

const LA_PATAGUA_ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (access !== 'LEC' && access !== 'ED') {
    return NextResponse.json({ error: 'Acceso a Mantención no autorizado para este usuario' }, { status: 403 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim() || '';
  if (q.length < 2) return NextResponse.json({ rows: [] });

  const safe = q.replace(/[%_,]/g, ' ').replace(/\s+/g, ' ').trim();
  if (safe.length < 2) return NextResponse.json({ rows: [] });

  try {
    const { data: products, error: productsError } = await context.supabase
      .from('canonical_products_v1')
      .select('id,product_code,name,family,unit,validation_status')
      .eq('organization_id', context.organizationId)
      .eq('is_active', true)
      .or(`product_code.ilike.%${safe}%,name.ilike.%${safe}%`)
      .limit(80);

    if (productsError) throw productsError;

    const productRows = products || [];
    const productIds = productRows.map((row) => row.id).filter(Boolean);
    const productCodes = productRows.map((row) => row.product_code).filter((value): value is string => Boolean(value));

    const [{ data: reservableRows, error: reservableError }, informedResult] = await Promise.all([
      productIds.length
        ? context.supabase
            .from('warehouse_stock')
            .select('canonical_product_id,quantity_available,quantity_on_hand,quantity_reserved,updated_at')
            .eq('organization_id', context.organizationId)
            .in('canonical_product_id', productIds)
        : Promise.resolve({ data: [], error: null }),
      context.organizationId === LA_PATAGUA_ORGANIZATION_ID && productCodes.length
        ? context.supabase
            .from('bodega_inventory')
            .select('sku,quantity,quantity_reported,updated_at')
            .in('sku', productCodes)
        : Promise.resolve({ data: [], error: null }),
    ]);

    if (reservableError) throw reservableError;
    if (informedResult.error) throw informedResult.error;

    const reservableByProduct = new Map<string, { quantity: number; latestAt: string | null }>();
    for (const row of reservableRows || []) {
      const id = String(row.canonical_product_id || '');
      if (!id) continue;
      const current = reservableByProduct.get(id) || { quantity: 0, latestAt: null };
      const fallbackAvailable = Math.max(0, toNumber(row.quantity_on_hand) - toNumber(row.quantity_reserved));
      current.quantity += row.quantity_available == null ? fallbackAvailable : toNumber(row.quantity_available);
      const updatedAt = row.updated_at ? String(row.updated_at) : null;
      if (updatedAt && (!current.latestAt || updatedAt > current.latestAt)) current.latestAt = updatedAt;
      reservableByProduct.set(id, current);
    }

    const informedBySku = new Map<string, { quantity: number; latestAt: string | null }>();
    for (const row of informedResult.data || []) {
      const sku = String(row.sku || '').trim().toUpperCase();
      if (!sku) continue;
      const reported = row.quantity_reported == null ? null : Number(row.quantity_reported);
      const quantity = Number.isFinite(reported) ? reported! : toNumber(row.quantity);
      const updatedAt = row.updated_at ? String(row.updated_at) : null;
      informedBySku.set(sku, { quantity, latestAt: updatedAt });
    }

    const needle = safe.toLowerCase();
    const rows = productRows
      .map((product) => {
        const code = product.product_code || null;
        const reservable = reservableByProduct.get(String(product.id)) || { quantity: 0, latestAt: null };
        const informed = code ? informedBySku.get(code.trim().toUpperCase()) || null : null;
        return {
          productId: product.id,
          productCode: code,
          productName: product.name || null,
          family: product.family || null,
          unit: product.unit || null,
          reservableQuantity: reservable.quantity,
          reservableUpdatedAt: reservable.latestAt,
          informedQuantity: informed?.quantity ?? null,
          informedUpdatedAt: informed?.latestAt ?? null,
          stockSignalSource: informed ? 'bodega_inventory' : null,
          reservationSource: 'warehouse_stock',
        };
      })
      .sort((a, b) => {
        const aCode = (a.productCode || '').toLowerCase();
        const bCode = (b.productCode || '').toLowerCase();
        const aExact = aCode === needle ? 0 : aCode.startsWith(needle) ? 1 : 2;
        const bExact = bCode === needle ? 0 : bCode.startsWith(needle) ? 1 : 2;
        return aExact - bExact || (a.productName || '').localeCompare(b.productName || '', 'es');
      })
      .slice(0, 20);

    return NextResponse.json({
      rows,
      source: {
        productIdentity: 'canonical_products_v1',
        stockSignal: context.organizationId === LA_PATAGUA_ORGANIZATION_ID ? 'bodega_inventory' : null,
        reservation: 'warehouse_stock',
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo buscar el catálogo de materiales' }, { status: 500 });
  }
}
