export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { orgHasCanonicalData } from '@/lib/api/canonical';

type PurchaseOrderRow = {
  id: string;
  po_number?: string | null;
  purchase_order_number?: string | null;
  order_number?: string | null;
  number?: string | null;
  code?: string | null;
  vendor_name?: string | null;
  vendor?: string | null;
  supplier_name?: string | null;
  supplier?: string | null;
  item_code?: string | null;
  reference?: string | null;
  description?: string | null;
  item_description?: string | null;
  status?: string | null;
  total_amount?: number | string | null;
  amount?: number | string | null;
  cost?: number | string | null;
  delivery_date?: string | null;
  expected_delivery_date?: string | null;
  order_date?: string | null;
  quantity?: number | string | null;
  qty?: number | string | null;
  unit_price?: number | string | null;
  price?: number | string | null;
  created_at?: string | null;
  updated_at?: string | null;
};

type NormalizedPurchaseOrder = {
  id: string;
  po_number: string;
  vendor_name: string;
  item_code: string;
  status: string;
  total_amount: number;
  delivery_date: string;
  quantity: number;
  unit_price: number;
  created_at: string | null;
};

function normalizeOrder(row: PurchaseOrderRow): NormalizedPurchaseOrder {
  return {
    id: row.id,
    po_number: row.po_number || row.purchase_order_number || row.order_number || row.number || row.code || row.id,
    vendor_name: row.vendor_name || row.vendor || row.supplier_name || row.supplier || 'Proveedor',
    item_code: row.item_code || row.reference || row.item_description || row.description || '',
    status: row.status || 'draft',
    total_amount: Number(row.total_amount || row.amount || row.cost || 0),
    delivery_date:
      row.delivery_date || row.expected_delivery_date || row.order_date || row.created_at || row.updated_at || '',
    quantity: Number(row.quantity || row.qty || 0),
    unit_price: Number(row.unit_price || row.price || 0),
    created_at: row.created_at || row.order_date || row.updated_at || null,
  };
}

export async function GET(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const orgId = auth.organizationId;
  const searchParams = request.nextUrl.searchParams;
  const search = searchParams.get('search')?.trim() || '';
  const page = parseInt(searchParams.get('page') || '0', 10);
  const pageSize = parseInt(searchParams.get('pageSize') || '50', 10);
  const status = searchParams.get('status')?.trim() || '';
  const scope = searchParams.get('scope') === 'history' ? 'history' : 'current';
  const validPageSize = Math.min(Math.max(pageSize, 10), 500);
  const validPage = Math.max(page, 0);
  const offset = validPage * validPageSize;

  let canonicalQuery = supabase
    .from('canonical_purchase_orders_v1')
    .select('*', { count: 'exact' })
    .eq('organization_id', orgId);

  canonicalQuery = scope === 'history'
    ? canonicalQuery.eq('source_file', 'public.purchase_orders')
    : canonicalQuery.or('source_file.is.null,source_file.neq.public.purchase_orders');

  if (search) {
    canonicalQuery = canonicalQuery.or(
      `po_number.ilike.%${search}%,vendor_name.ilike.%${search}%,item_code.ilike.%${search}%,item_description.ilike.%${search}%`,
    );
  }
  if (status) canonicalQuery = canonicalQuery.eq('status', status);

  const { data, error, count } = await canonicalQuery
    .order('order_date', { ascending: false })
    .range(offset, offset + validPageSize - 1);

  if (!error) {
    const total = count || 0;
    return NextResponse.json({
      orders: ((data || []) as PurchaseOrderRow[]).map(normalizeOrder),
      pagination: {
        page: validPage,
        pageSize: validPageSize,
        total,
        totalPages: Math.ceil(total / validPageSize),
      },
      dataSource: scope === 'history' ? 'canonical-history' : 'canonical-current',
      scope,
      warning: scope === 'history' ? 'Archivo histórico importado; no representa compras vigentes.' : undefined,
      generated_at: new Date().toISOString(),
    });
  }

  let legacyQuery = supabase.from('purchase_orders').select('*', { count: 'exact' });
  if (orgId) legacyQuery = legacyQuery.eq('organization_id', orgId);
  if (search) {
    legacyQuery = legacyQuery.or(
      `po_number.ilike.%${search}%,vendor_name.ilike.%${search}%,item_code.ilike.%${search}%`,
    );
  }
  if (status) legacyQuery = legacyQuery.eq('status', status);

  const legacyResult = await legacyQuery
    .order('delivery_date', { ascending: false })
    .range(offset, offset + validPageSize - 1);

  if (legacyResult.error) {
    return NextResponse.json(
      {
        error: 'No fue posible cargar las órdenes desde la tabla operativa.',
        details: legacyResult.error.message,
        orders: [],
        pagination: { page: validPage, pageSize: validPageSize, total: 0, totalPages: 0 },
      },
      { status: 500 },
    );
  }

  const total = legacyResult.count || 0;
  return NextResponse.json({
    orders: ((legacyResult.data || []) as PurchaseOrderRow[]).map(normalizeOrder),
    pagination: {
      page: validPage,
      pageSize: validPageSize,
      total,
      totalPages: Math.ceil(total / validPageSize),
    },
    dataSource: 'legacy',
    warning: 'Órdenes servidas desde la tabla operativa de respaldo.',
    generated_at: new Date().toISOString(),
  });
}

export async function POST(request: NextRequest) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const supabase = getSupabaseServerClient();
  const orgId = auth.organizationId;

  try {
    const body = await request.json();
    const vendor_name = String(body.vendor_name || body.vendor || '').trim();
    const item_code = String(body.item_code || body.item || '').trim();
    const quantity = Number(body.quantity || 0);
    const unit_price = Number(body.unit_price || body.price || 0);
    const delivery_date = String(body.delivery_date || '').trim() || null;

    if (!vendor_name || !item_code || quantity <= 0 || unit_price <= 0 || !delivery_date) {
      return NextResponse.json(
        { error: 'vendor_name, item_code, quantity, unit_price y delivery_date son requeridos' },
        { status: 400 },
      );
    }

    const total_amount = quantity * unit_price;
    let countQuery = supabase.from('purchase_orders').select('id', { count: 'exact', head: true });
    if (orgId) countQuery = countQuery.eq('organization_id', orgId);
    const { count } = await countQuery;
    const po_number = `PO-${new Date().getFullYear()}-${String((count || 0) + 1).padStart(4, '0')}`;

    const { data, error } = await supabase
      .from('purchase_orders')
      .insert({
        ...(orgId ? { organization_id: orgId } : {}),
        po_number,
        vendor_name,
        item_code,
        quantity,
        unit_price,
        total_amount,
        delivery_date,
        status: 'draft',
        created_by: null,
      })
      .select('*')
      .single();

    if (error) throw error;
    return NextResponse.json({ data: normalizeOrder(data as PurchaseOrderRow) }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la orden de compra';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
