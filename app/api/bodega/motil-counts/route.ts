export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { stockSearchPattern } from '@/lib/bodega/stock-search-pattern.mjs';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUANTITY = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;

async function contextFor(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return { ok: false as const, response: access.response };
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok: false as const, response: context.response };
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return { ok: false as const, response: NextResponse.json({ error: 'No se pudo comprobar tu organización.' }, { status: 403 }) };
  }
  return { ok: true as const, context };
}

async function centralWarehouse(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>) {
  const { data, error } = await context.supabase.from('warehouses')
    .select('id,name,code').eq('organization_id', context.organizationId).eq('code', '002').maybeSingle();
  if (error) throw error;
  return data;
}

async function isAssigned(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>, warehouseId: string) {
  const [{ data: assignment, error: assignmentError }, { data: profile, error: profileError }] = await Promise.all([
    context.supabase.from('bodega_stock_verifier_assignments')
      .select('id,expires_at').eq('organization_id', context.organizationId)
      .eq('warehouse_id', warehouseId).eq('profile_id', context.userId)
      .eq('is_active', true).maybeSingle(),
    context.supabase.from('profiles').select('status').eq('id', context.userId)
      .eq('organization_id', context.organizationId).maybeSingle(),
  ]);
  if (assignmentError) throw assignmentError;
  if (profileError) throw profileError;
  return profile?.status === 'active' && !!assignment
    && (!assignment.expires_at || Date.parse(assignment.expires_at) > Date.now());
}

export async function GET(request: NextRequest) {
  const gate = await contextFor(request);
  if (!gate.ok) return gate.response;
  const { context } = gate;
  try {
    const warehouse = await centralWarehouse(context);
    if (!warehouse) return NextResponse.json({ error: 'Bodega Central (002) no está configurada.' }, { status: 503 });
    const search = String(request.nextUrl.searchParams.get('search') || '').trim().slice(0, 80);
    const page = Number(request.nextUrl.searchParams.get('page') || 0);
    const offset = Number.isFinite(page) ? Math.min(100000, Math.max(0, Math.trunc(page)) * 50) : 0;

    let catalogQuery = context.supabase.from('bodega_motil_stock_count_catalog_v1')
      .select('canonical_product_id,product_code,product_name,description,unit_of_measure', { count: 'exact' })
      .eq('organization_id', context.organizationId).order('product_code', { ascending: true });
    if (search) {
      const pattern = stockSearchPattern(search);
      if (!pattern) return NextResponse.json({ error: 'Busca por código o nombre de producto.' }, { status: 400 });
      catalogQuery = catalogQuery.or('product_code.ilike.%' + pattern + '%,product_name.ilike.%' + pattern + '%,description.ilike.%' + pattern + '%');
    }

    const [{ data: products, error: catalogError, count }, { data: counts, error: countsError }] = await Promise.all([
      catalogQuery.range(offset, offset + 49),
      context.supabase.from('bodega_motil_stock_count_queue_v1')
        .select('id,warehouse_id,canonical_product_id,product_code,product_name,unit_of_measure,counted_quantity,counted_by,counted_at,note,evidence_reference,decision,reviewed_by,reviewed_at,review_note')
        .eq('organization_id', context.organizationId).eq('warehouse_id', warehouse.id)
        .order('counted_at', { ascending: false }).limit(100),
    ]);
    if (catalogError) throw catalogError;
    if (countsError) throw countsError;

    const canReview = await isAssigned(context, warehouse.id);
    return NextResponse.json({
      warehouse: { id: warehouse.id, name: warehouse.name, code: warehouse.code },
      products: products || [],
      productCount: count || 0,
      page: Math.floor(offset / 50),
      counts: counts || [],
      currentUserId: context.userId,
      canCount: canReview,
      canReview,
      stockChanged: false,
      sourceSystem: 'MOTIL',
    });
  } catch (error) {
    console.error('[bodega/motil-counts][GET]', error);
    return NextResponse.json({ error: 'No se pudo cargar el conteo MOTIL.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await contextFor(request);
  if (!gate.ok) return gate.response;
  const { context } = gate;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 8000) throw new Error('invalid-body');
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid-body');
  } catch {
    return NextResponse.json({ error: 'Revisa los datos enviados.' }, { status: 400 });
  }

  try {
    const warehouse = await centralWarehouse(context);
    if (!warehouse) return NextResponse.json({ error: 'Bodega Central (002) no está configurada.' }, { status: 503 });
    if (!await isAssigned(context, warehouse.id)) {
      return NextResponse.json({ error: 'No tienes una asignación vigente para confirmar conteos en esta bodega.' }, { status: 403 });
    }

    if (body.action === 'count') {
      const productId = String(body.canonicalProductId || '');
      const requestId = String(body.requestId || '');
      const countedQuantity = String(body.countedQuantity ?? '').trim().replace(',', '.');
      const note = String(body.note || '').trim();
      const evidenceReference = String(body.evidenceReference || '').trim();
      if (!UUID.test(productId) || !UUID.test(requestId) || !QUANTITY.test(countedQuantity)
          || body.confirmPhysicalCount !== true || note.length > 1000 || evidenceReference.length > 500) {
        return NextResponse.json({ error: 'Indica producto, cantidad contada y confirma la revisión física.' }, { status: 400 });
      }

      const { data: product, error: productError } = await context.supabase
        .from('bodega_motil_stock_count_catalog_v1')
        .select('canonical_product_id,product_code,product_name,unit_of_measure')
        .eq('organization_id', context.organizationId)
        .eq('canonical_product_id', productId).maybeSingle();
      if (productError) throw productError;
      if (!product?.unit_of_measure) {
        return NextResponse.json({ error: 'El producto o su unidad aún no están validados en el catálogo MOTIL.' }, { status: 409 });
      }

      const { data, error } = await context.supabase.from('bodega_motil_stock_counts_v1').insert({
        organization_id: context.organizationId,
        warehouse_id: warehouse.id,
        canonical_product_id: product.canonical_product_id,
        product_code: product.product_code,
        product_name: product.product_name,
        unit_of_measure: product.unit_of_measure,
        counted_quantity: countedQuantity,
        counted_by: context.userId,
        note: note || null,
        evidence_reference: evidenceReference || null,
        request_id: requestId,
      }).select('id,counted_at').single();

      if (error?.code === '23505') {
        const { data: previous, error: previousError } = await context.supabase
          .from('bodega_motil_stock_counts_v1').select('id,counted_at,canonical_product_id,counted_by,counted_quantity')
          .eq('organization_id', context.organizationId).eq('request_id', requestId).maybeSingle();
        if (previousError) throw previousError;
        if (previous && previous.canonical_product_id === productId && previous.counted_by === context.userId
            && Number(previous.counted_quantity) === Number(countedQuantity)) {
          return NextResponse.json({ recorded: true, duplicate: true, countId: previous.id, countedAt: previous.counted_at, stockChanged: false });
        }
        return NextResponse.json({ error: 'Este registro ya se utilizó. Actualiza el conteo.' }, { status: 409 });
      }
      if (error) throw error;
      return NextResponse.json({ recorded: true, duplicate: false, countId: data.id, countedAt: data.counted_at, stockChanged: false }, { status: 201 });
    }

    if (body.action === 'review') {
      const countId = String(body.countId || '');
      const decision = String(body.decision || '');
      const reviewNote = String(body.reviewNote || '').trim();
      if (!UUID.test(countId) || !['approved_for_opening', 'recount_required'].includes(decision)
          || reviewNote.length > 1000 || (decision === 'recount_required' && reviewNote.length < 8)) {
        return NextResponse.json({ error: 'Selecciona una decisión y explica si solicitas un nuevo conteo.' }, { status: 400 });
      }
      const { data: count, error: countError } = await context.supabase
        .from('bodega_motil_stock_count_queue_v1')
        .select('id,counted_by')
        .eq('organization_id', context.organizationId).eq('warehouse_id', warehouse.id).eq('id', countId).maybeSingle();
      if (countError) throw countError;
      if (!count) return NextResponse.json({ error: 'No encontramos este conteo en Bodega Central.' }, { status: 404 });
      if (count.counted_by === context.userId) {
        return NextResponse.json({ error: 'La revisión debe hacerla otra persona asignada.' }, { status: 403 });
      }
      const { data, error } = await context.supabase.from('bodega_motil_stock_count_reviews_v1').insert({
        organization_id: context.organizationId,
        count_id: count.id,
        decision,
        reviewed_by: context.userId,
        review_note: reviewNote || null,
      }).select('id,reviewed_at').single();
      if (error?.code === '23505') {
        return NextResponse.json({ error: 'Este conteo ya tiene una revisión registrada. Genera un nuevo conteo si cambió la cantidad.' }, { status: 409 });
      }
      if (error) throw error;
      return NextResponse.json({ reviewed: true, decision, reviewedAt: data.reviewed_at, stockChanged: false }, { status: 201 });
    }

    return NextResponse.json({ error: 'Acción de conteo no válida.' }, { status: 400 });
  } catch (error) {
    console.error('[bodega/motil-counts][POST]', error);
    return NextResponse.json({ error: 'No fue posible guardar el registro. El stock disponible no fue modificado.' }, { status: 500 });
  }
}
