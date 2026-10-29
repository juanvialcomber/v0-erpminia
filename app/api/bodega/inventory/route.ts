export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { canonicalCategory } from '@/lib/bodega-normalization';
import { orgHasCanonicalData } from '@/lib/api/canonical';

type CanonicalInventoryRow = {
  id: string;
  sku: string | null;
  name: string | null;
  category: string | null;
  description: string | null;
  quantity: number | string | null;
  min_stock: number | string | null;
  max_stock: number | string | null;
  unit_cost: number | string | null;
  warehouse_code: string | null;
};

type LaudusInventoryRow = {
  sku: string | null;
  laudus_stock: number | string | null;
  laudus_synced_at: string | null;
  reconciliation_state: string | null;
};

type InventoryRow = {
  id: string;
  sku?: string | null;
  name?: string | null;
  category?: string | null;
  description?: string | null;
  quantity?: number | null;
  min_stock?: number | null;
  max_stock?: number | null;
  unit_cost?: number | null;
  total_value?: number | null;
  location?: string | null;
  warehouse_code?: string | null;
  organization_id?: string | null;
  created_at?: string | null;
};

function toNumber(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

async function applyStockAuthority(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  organizationId: string | null,
  rows: InventoryRow[],
) {
  if (!organizationId || rows.length === 0) {
    return { rows, dataSource: 'motil-canonical', authorityState: 'review_laudus_unavailable' };
  }

  const { data: authority, error: authorityError } = await supabase
    .from('bodega_stock_source_authority_service_v1')
    .select('authority_state,authority_reason,latest_laudus_stock_sync')
    .eq('organization_id', organizationId)
    .maybeSingle();

  if (authorityError || authority?.authority_state !== 'laudus_primary') {
    return {
      rows,
      dataSource: 'motil-canonical',
      authorityState: authority?.authority_state || 'review_laudus_unavailable',
      authorityReason: authority?.authority_reason || null,
      latestLaudusStockSync: authority?.latest_laudus_stock_sync || null,
    };
  }

  const skus = [...new Set(rows.map((row) => String(row.sku || '').trim().toUpperCase()).filter(Boolean))];
  if (skus.length === 0) {
    return {
      rows,
      dataSource: 'motil-canonical',
      authorityState: authority.authority_state,
      authorityReason: authority.authority_reason || null,
      latestLaudusStockSync: authority.latest_laudus_stock_sync || null,
    };
  }

  const { data: laudusRows, error: laudusError } = await supabase
    .from('laudus_inventory_reconciliation_service_v1')
    .select('sku,laudus_stock,laudus_synced_at,reconciliation_state')
    .eq('organization_id', organizationId)
    .in('sku', skus);

  if (laudusError) {
    return {
      rows,
      dataSource: 'motil-canonical',
      authorityState: 'review_laudus_unavailable',
      authorityReason: 'No fue posible leer el stock Laudus para esta página.',
      latestLaudusStockSync: authority.latest_laudus_stock_sync || null,
    };
  }

  const bySku = new Map(
    ((laudusRows || []) as LaudusInventoryRow[])
      .filter((row) => row.sku)
      .map((row) => [String(row.sku).trim().toUpperCase(), row]),
  );

  const effectiveRows = rows.map((row) => {
    const laudus = bySku.get(String(row.sku || '').trim().toUpperCase());
    if (!laudus || laudus.laudus_stock == null) return row;
    return {
      ...row,
      quantity: Number(laudus.laudus_stock),
      stock_source: 'laudus',
      laudus_synced_at: laudus.laudus_synced_at,
      reconciliation_state: laudus.reconciliation_state,
    } as InventoryRow;
  });

  return {
    rows: effectiveRows,
    dataSource: 'laudus-primary',
    authorityState: authority.authority_state,
    authorityReason: authority.authority_reason || null,
    latestLaudusStockSync: authority.latest_laudus_stock_sync || null,
  };
}

function mapInventoryItem(item: InventoryRow) {
  const quantity = toNumber(item.quantity);
  const unitCost = toNumber(item.unit_cost);

  return {
    id: item.id,
    sku: String(item.sku || ''),
    name: String(item.name || item.sku || ''),
    category: String(item.category || 'Otros'),
    quantity,
    quantity_available: quantity,
    quantity_reserved: 0,
    min_stock: toNumber(item.min_stock),
    max_stock: toNumber(item.max_stock),
    unit_cost: unitCost,
    total_value: toNumber(item.total_value) || quantity * unitCost,
    description: String(item.description || item.location || item.warehouse_code || ''),
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;

  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const orgId = auth.organizationId;
  const { searchParams } = new URL(request.url);
  const page = parseInt(searchParams.get('page') || '0', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const search = searchParams.get('search')?.trim() || '';
  const category = searchParams.get('category')?.trim() || '';
  const validPageSize = Math.min(Math.max(pageSize, 10), 500);
  const validPage = Math.max(page, 0);
  const offset = validPage * validPageSize;

  if (orgHasCanonicalData(orgId)) {
    if (searchParams.get('categories') === 'true') {
      const categorySet = new Set<string>();
      let from = 0;
      const chunk = 1000;

      while (true) {
        const query = supabase
          .from('canonical_inventory_current')
          .select('category')
          .eq('organization_id', orgId)
          .order('category')
          .range(from, from + chunk - 1);

        const { data, error } = await query;
        if (error) {
          return NextResponse.json({ categories: [], warning: error.message });
        }
        if (!data || data.length === 0) break;

        for (const row of data as Array<{ category?: string | null }>) {
          const label = String(row.category || '').trim();
          if (label) categorySet.add(canonicalCategory(label) || label);
        }

        if (data.length < chunk) break;
        from += chunk;
      }

      return NextResponse.json({
        categories: Array.from(categorySet).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
      });
    }

    let canonicalQuery = supabase
      .from('canonical_inventory_current')
      .select('id, sku, name, category, description, quantity, min_stock, max_stock, unit_cost, warehouse_code', { count: 'exact' })
      .eq('organization_id', orgId);

    if (search) {
      canonicalQuery = canonicalQuery.or(`sku.ilike.%${search}%,name.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`);
    }
    if (category) {
      canonicalQuery = canonicalQuery.ilike('category', `%${category}%`);
    }

    const { data, error, count } = await canonicalQuery
      .order('sku')
      .range(offset, offset + validPageSize - 1);

    if (error) {
      console.error('[v0] canonical inventory error:', error);
    } else if (data && data.length > 0) {
      const authority = await applyStockAuthority(
        supabase,
        orgId,
        (data as CanonicalInventoryRow[]).map((item) => ({
          ...item,
          quantity: item.quantity == null ? null : Number(item.quantity),
          min_stock: item.min_stock == null ? null : Number(item.min_stock),
          max_stock: item.max_stock == null ? null : Number(item.max_stock),
          unit_cost: item.unit_cost == null ? null : Number(item.unit_cost),
        })),
      );
      const inventory = authority.rows.map((item) => ({
        id: item.id,
        sku: String(item.sku || ''),
        name: String(item.name || item.sku || ''),
        category: String(item.category || 'Otros'),
        quantity: toNumber(item.quantity),
        quantity_available: toNumber(item.quantity),
        quantity_reserved: 0,
        min_stock: toNumber(item.min_stock),
        max_stock: toNumber(item.max_stock),
        unit_cost: toNumber(item.unit_cost),
        description: String(item.description || item.warehouse_code || ''),
      }));

      return NextResponse.json({
        inventory,
        dataSource: authority.dataSource,
        sourceAuthority: {
          state: authority.authorityState,
          reason: authority.authorityReason || null,
          latestLaudusStockSync: authority.latestLaudusStockSync || null,
        },
        pagination: {
          page: validPage,
          pageSize: validPageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / validPageSize),
        },
      });
    }
  }

  if (searchParams.get('categories') === 'true') {
    const canonicalQuery = supabase
      .from('canonical_inventory_current')
      .select('category')
      .eq('organization_id', orgId);

    const { data: canonicalRows, error: canonicalError } = await canonicalQuery;
    if (!canonicalError) {
      const categories = Array.from(
        new Set(
          (canonicalRows ?? [])
            .map((row) => canonicalCategory(String((row as { category?: string | null }).category || '').trim()))
            .filter(Boolean),
        ),
      ).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' }));

      return NextResponse.json({ categories, dataSource: 'canonical' });
    }
  }

  let canonicalQuery = supabase
    .from('canonical_inventory_current')
    .select(
      'id, sku, name, category, description, quantity, min_stock, max_stock, unit_cost, total_value, warehouse_code, organization_id',
      { count: 'exact' },
    )
    .eq('organization_id', orgId);

  if (search) {
    canonicalQuery = canonicalQuery.or(
      `sku.ilike.%${search}%,name.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }
  if (category) canonicalQuery = canonicalQuery.ilike('category', `%${category}%`);

  const canonicalResult = await canonicalQuery.order('sku').range(offset, offset + validPageSize - 1);

  if (!canonicalResult.error) {
    const total = canonicalResult.count || 0;
    const authority = await applyStockAuthority(
      supabase,
      orgId,
      (canonicalResult.data as InventoryRow[] | null) || [],
    );
    return NextResponse.json({
      inventory: authority.rows.map(mapInventoryItem),
      pagination: {
        page: validPage,
        pageSize: validPageSize,
        total,
        totalPages: Math.ceil(total / validPageSize),
      },
      dataSource: authority.dataSource,
      sourceAuthority: {
        state: authority.authorityState,
        reason: authority.authorityReason || null,
        latestLaudusStockSync: authority.latestLaudusStockSync || null,
      },
    });
  }

  let legacyQuery = supabase
    .from('bodega_inventory')
    .select(
      'id, sku, name, category, description, quantity, min_stock, max_stock, unit_cost, location, organization_id, created_at',
      { count: 'exact' },
    );

  if (orgId) legacyQuery = legacyQuery.or(`organization_id.eq.${orgId},organization_id.is.null`);
  if (search) {
    legacyQuery = legacyQuery.or(
      `sku.ilike.%${search}%,name.ilike.%${search}%,category.ilike.%${search}%,description.ilike.%${search}%`,
    );
  }
  if (category) legacyQuery = legacyQuery.ilike('category', `%${category}%`);

  const legacyResult = await legacyQuery.order('sku').range(offset, offset + validPageSize - 1);

  if (legacyResult.error) {
    return NextResponse.json(
      {
        inventory: [],
        pagination: { page: validPage, pageSize: validPageSize, total: 0, totalPages: 0 },
        error: 'No fue posible cargar el inventario canónico ni su respaldo operativo.',
        details: {
          canonical: canonicalResult.error.message,
          legacy: legacyResult.error.message,
        },
      },
      { status: 500 },
    );
  }

  const total = legacyResult.count || 0;
  return NextResponse.json({
    inventory: (legacyResult.data as InventoryRow[] | null)?.map(mapInventoryItem) || [],
    pagination: {
      page: validPage,
      pageSize: validPageSize,
      total,
      totalPages: Math.ceil(total / validPageSize),
    },
    dataSource: 'legacy',
    warning: 'Inventario servido desde la tabla operativa de respaldo.',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO, true);
  if (!access.authorized) return access.response;

  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const body = await request.json();
  const { sku, name, category, quantity, unit_cost } = body;

  const { data, error } = await supabase
    .from('bodega_inventory')
    .insert({
      sku,
      name,
      category: canonicalCategory(category),
      quantity,
      unit_cost,
      ...(auth.organizationId ? { organization_id: auth.organizationId } : {}),
    })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ item: data }, { status: 201 });
}
