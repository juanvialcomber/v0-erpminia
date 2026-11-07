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

type OperationalInventoryRow = {
  canonical_product_id: string | null;
  laudus_product_external_id: string | null;
  sku: string | null;
  description: string | null;
  unit_of_measure: string | null;
  operational_category: string | null;
  operational_quantity: number | string | null;
  operational_resolution: string | null;
  laudus_synced_at: string | null;
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
    const { data: authority } = await supabase
      .from('bodega_stock_source_authority_service_v1')
      .select('authority_state,authority_reason,latest_laudus_stock_sync')
      .eq('organization_id', orgId)
      .limit(1)
      .maybeSingle();

    if (authority?.authority_state === 'laudus_primary') {
      if (searchParams.get('categories') === 'true') {
        const categories = new Set<string>();
        let from = 0;
        const chunk = 1000;

        while (true) {
          const { data: categoryRows, error: categoryError } = await supabase
            .from('bodega_inventory_operational_service_v1')
            .select('operational_category')
            .eq('organization_id', orgId)
            .neq('reconciliation_state', 'laudus_only_zero')
            .order('operational_category')
            .range(from, from + chunk - 1);

          if (categoryError) break;
          const batch = Array.isArray(categoryRows) ? categoryRows : [];
          for (const row of batch as Array<{ operational_category?: string | null }>) {
            const label = String(row.operational_category || '').trim();
            if (label) categories.add(canonicalCategory(label) || label);
          }
          if (batch.length < chunk) break;
          from += chunk;
        }

        if (categories.size > 0) {
          return NextResponse.json({
            categories: Array.from(categories).sort((a, b) => a.localeCompare(b, 'es', { sensitivity: 'base' })),
            dataSource: 'laudus_operational',
            sourceAuthority: authority,
          });
        }
      }

      let operationalQuery = supabase
        .from('bodega_inventory_operational_service_v1')
        .select(
          'canonical_product_id,laudus_product_external_id,sku,description,unit_of_measure,operational_category,operational_quantity,operational_resolution,laudus_synced_at',
          { count: 'exact' },
        )
        .eq('organization_id', orgId)
        .neq('reconciliation_state', 'laudus_only_zero');

      if (search) {
        operationalQuery = operationalQuery.or(
          `sku.ilike.%${search}%,description.ilike.%${search}%,operational_category.ilike.%${search}%`,
        );
      }
      if (category) operationalQuery = operationalQuery.ilike('operational_category', `%${category}%`);

      const operationalResult = await operationalQuery
        .order('sku')
        .range(offset, offset + validPageSize - 1);

      if (!operationalResult.error && operationalResult.data) {
        const rows = operationalResult.data as OperationalInventoryRow[];
        const canonicalIds = rows
          .map((row) => row.canonical_product_id)
          .filter((value): value is string => Boolean(value));
        const canonicalById = new Map<string, CanonicalInventoryRow>();

        for (let i = 0; i < canonicalIds.length; i += 50) {
          const batchIds = canonicalIds.slice(i, i + 50);
          const { data: canonicalData, error: canonicalError } = await supabase
            .from('canonical_inventory_current')
            .select('id,sku,name,category,description,quantity,min_stock,max_stock,unit_cost,warehouse_code')
            .eq('organization_id', orgId)
            .in('id', batchIds);

          if (canonicalError) {
            console.error('[bodega/inventory:canonical-enrichment]', canonicalError);
            break;
          }

          for (const row of (canonicalData || []) as CanonicalInventoryRow[]) canonicalById.set(row.id, row);
        }

        const inventory = rows.map((row) => {
          const canonical = row.canonical_product_id ? canonicalById.get(row.canonical_product_id) : undefined;
          const quantity = toNumber(row.operational_quantity);
          const unitCost = toNumber(canonical?.unit_cost);
          const sourceOnly = !row.canonical_product_id;

          return {
            id: canonical?.id || `laudus:${row.laudus_product_external_id || row.sku || 'unknown'}`,
            sku: String(row.sku || canonical?.sku || ''),
            name: String(canonical?.name || row.description || row.sku || ''),
            category: String(canonical?.category || row.operational_category || 'Otros'),
            quantity,
            quantity_available: quantity,
            quantity_reserved: 0,
            min_stock: toNumber(canonical?.min_stock),
            max_stock: toNumber(canonical?.max_stock),
            unit_cost: unitCost,
            total_value: quantity * unitCost,
            description: String(canonical?.description || row.description || row.unit_of_measure || ''),
            sourceOnly,
            readOnly: sourceOnly,
            source: 'laudus',
            operationalResolution: row.operational_resolution,
            sourceSyncedAt: row.laudus_synced_at,
          };
        });

        return NextResponse.json({
          inventory,
          pagination: {
            page: validPage,
            pageSize: validPageSize,
            total: operationalResult.count || 0,
            totalPages: Math.ceil((operationalResult.count || 0) / validPageSize),
          },
          dataSource: 'laudus_operational',
          sourceAuthority: authority,
        });
      }

      if (operationalResult.error) {
        console.error('[bodega/inventory:laudus-operational]', operationalResult.error);
      }
    }

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
      const inventory = (data as CanonicalInventoryRow[]).map((item) => ({
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
        pagination: {
          page: validPage,
          pageSize: validPageSize,
          total: count || 0,
          totalPages: Math.ceil((count || 0) / validPageSize),
        },
        dataSource: 'canonical_fallback',
        sourceAuthority: authority || null,
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
    return NextResponse.json({
      inventory: (canonicalResult.data as InventoryRow[] | null)?.map(mapInventoryItem) || [],
      pagination: {
        page: validPage,
        pageSize: validPageSize,
        total,
        totalPages: Math.ceil(total / validPageSize),
      },
      dataSource: 'canonical',
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
