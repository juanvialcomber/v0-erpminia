export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { canonicalCategory, getCategoryColor } from '@/lib/bodega-normalization';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';

type CategoryRow = {
  category?: string | null;
  quantity?: number | null;
  min_stock?: number | null;
};

function summarize(rows: CategoryRow[]) {
  const map = new Map<string, { count: number; low_stock: number; total_stock: number }>();

  for (const row of rows) {
    const label = canonicalCategory(String(row.category || '').trim() || 'Otros');
    const existing = map.get(label) ?? { count: 0, low_stock: 0, total_stock: 0 };
    const quantity = Number(row.quantity || 0);
    const minStock = Number(row.min_stock || 0);
    existing.count += 1;
    existing.total_stock += quantity;
    if (isStockBelowMinimum(quantity, minStock)) existing.low_stock += 1;
    map.set(label, existing);
  }

  return Array.from(map.entries())
    .map(([label, stats]) => ({
      label,
      color: getCategoryColor(label),
      count: stats.count,
      total_stock: stats.total_stock,
      low_stock: stats.low_stock,
    }))
    .sort((a, b) => b.count - a.count);
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const supabase = getSupabaseServerClient();
  const orgId = access.organizationId;

  const canonicalResult = await supabase
    .from('canonical_inventory_current')
    .select('category, quantity, min_stock')
    .eq('organization_id', orgId);

  if (!canonicalResult.error) {
    return NextResponse.json({
      categories: summarize((canonicalResult.data as CategoryRow[] | null) || []),
      dataSource: 'canonical',
    });
  }

  let legacyQuery = supabase.from('bodega_inventory').select('category, quantity, min_stock');
  if (orgId) legacyQuery = legacyQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);

  const legacyResult = await legacyQuery;
  if (legacyResult.error) {
    return NextResponse.json(
      {
        categories: [],
        error: 'No fue posible cargar las familias del inventario.',
        details: {
          canonical: canonicalResult.error.message,
          legacy: legacyResult.error.message,
        },
      },
      { status: 500 },
    );
  }

  return NextResponse.json({
    categories: summarize((legacyResult.data as CategoryRow[] | null) || []),
    dataSource: 'legacy',
    warning: 'Familias servidas desde la tabla operativa de respaldo.',
  });
}
