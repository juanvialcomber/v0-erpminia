export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUANTITY = /^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/;
const allowedStates = new Set(['all', 'pending', 'matched', 'difference', 'source_changed']);

type SourceRow = {
  warehouse_id: string;
  canonical_product_id: string;
  product_external_id: string;
  sku: string;
  unit_of_measure: string | null;
  source_quantity: number | string;
  source_cutoff: string | null;
  source_synced_at: string | null;
  source_identity_count: number;
};

async function contextFor(request: NextRequest) {
  // This route has a narrower write permission than Bodega module editing:
  // a current, named physical verifier assignment is required for POST.
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return { ok: false as const, response: access.response };
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok: false as const, response: context.response };
  if (access.user.id !== context.userId || access.organizationId !== context.organizationId) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'No se pudo comprobar tu organización.' }, { status: 403 }),
    };
  }
  return { ok: true as const, context, canWrite: access.canWrite };
}

async function centralWarehouse(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>) {
  const { data, error } = await context.supabase
    .from('bodega_central_stock_canonicalization_summary_v1')
    .select('warehouse_id,source_cutoff,source_synced_at')
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  const gate = await contextFor(request);
  if (!gate.ok) return gate.response;
  const { context } = gate;
  const params = request.nextUrl.searchParams;
  const state = params.get('state') || 'all';
  if (!allowedStates.has(state)) {
    return NextResponse.json({ error: 'Filtro de estado no válido.' }, { status: 400 });
  }
  const sku = String(params.get('sku') || '').trim().slice(0, 80);
  const withStock = params.get('scope') !== 'all';
  const limitRaw = Number(params.get('limit') || 25);
  const offsetRaw = Number(params.get('offset') || 0);
  const limit = Number.isFinite(limitRaw) ? Math.min(50, Math.max(1, Math.trunc(limitRaw))) : 25;
  const offset = Number.isFinite(offsetRaw) ? Math.min(100000, Math.max(0, Math.trunc(offsetRaw))) : 0;

  try {
    const warehouse = await centralWarehouse(context);
    if (!warehouse?.warehouse_id) {
      return NextResponse.json({ error: 'Bodega Central aún no está preparada para revisar conteos.' }, { status: 503 });
    }

    const { data: assignments, error: assignmentError } = await context.supabase
      .from('bodega_stock_verifier_assignments')
      .select('profile_id,expires_at')
      .eq('organization_id', context.organizationId)
      .eq('warehouse_id', warehouse.warehouse_id)
      .eq('is_active', true)
      .limit(10);
    if (assignmentError) throw assignmentError;
    type Assignment = { profile_id: string; expires_at: string | null };
    const currentTime = Date.now();
    const current = ((assignments || []) as Assignment[]).filter((row) =>
      !row.expires_at || Date.parse(row.expires_at) > currentTime);
    const assignedIds = [...new Set(current.map((row) => row.profile_id))];
    const { data: people, error: peopleError } = assignedIds.length
      ? await context.supabase.from('profiles').select('id,full_name,status')
          .eq('organization_id', context.organizationId).in('id', assignedIds)
      : { data: [], error: null };
    if (peopleError) throw peopleError;
    const names = new Map((people || []).filter((row) => row.status === 'active')
      .map((row) => [row.id, row.full_name]));
    const canVerify = current.some((row) => row.profile_id === context.userId) && names.has(context.userId);
    const primaryId = current.find((row) => row.expires_at === null)?.profile_id;
    const support = current.find((row) => row.expires_at !== null && names.has(row.profile_id));

    // A dedicated, read-only progress request avoids repeating aggregate
    // counts for every SKU search and pagination click.
    if (params.get('summary') === '1') {
      const states = ['pending', 'matched', 'difference', 'source_changed'] as const;
      const results = await Promise.all(states.map(async (verificationState) => {
        const { count, error } = await context.supabase
          .from('bodega_central_stock_verification_queue_v1')
          .select('canonical_product_id', { head: true, count: 'exact' })
          .eq('organization_id', context.organizationId)
          .eq('warehouse_id', warehouse.warehouse_id)
          .neq('source_quantity', 0)
          .eq('verification_state', verificationState);
        if (error) throw error;
        if (count === null) throw new Error('No se pudo contar la cobertura de Bodega.');
        return [verificationState, count] as const;
      }));
      const counts = Object.fromEntries(results) as Record<(typeof states)[number], number>;
      return NextResponse.json({
        warehouseName: 'Bodega Central (002)',
        sourceCutoff: warehouse.source_cutoff,
        sourceSyncedAt: warehouse.source_synced_at,
        scope: 'with-stock',
        counts: {
          ...counts,
          total: states.reduce((sum, key) => sum + counts[key], 0),
        },
        readOnlyStock: true,
      });
    }

    let query = context.supabase.from('bodega_central_stock_verification_queue_v1')
      .select('canonical_product_id,sku,description,unit_of_measure,source_quantity,source_synced_at,source_cutoff,canonicalization_state,source_identity_count,counted_quantity,verified_source_quantity,verified_at,verification_note,verification_state,difference_from_current_source', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .eq('warehouse_id', warehouse.warehouse_id)
      .order('sku', { ascending: true });
    if (withStock) query = query.neq('source_quantity', 0);
    if (state !== 'all') query = query.eq('verification_state', state);
    if (sku) {
      // Keep PostgREST OR filters syntactically safe. Search both code and name
      // so Bodega can locate parts without memorizing their SKU.
      const search = sku.replace(/[^a-zA-Z0-9áéíóúñÁÉÍÓÚÑüÜ\s./-]/g, '').trim();
      if (!search) return NextResponse.json({ error: 'Busca por código o descripción del producto.' }, { status: 400 });
      query = query.or('sku.ilike.%' + search + '%,description.ilike.%' + search + '%');
    }
    const { data, error, count } = await query.range(offset, offset + limit - 1);
    if (error) throw error;

    return NextResponse.json({
      warehouseName: 'Bodega Central (002)',
      responsibleName: names.get(primaryId || '') || 'Jefe de Bodega asignado',
      temporarySupportName: support ? names.get(support.profile_id) : null,
      temporarySupportUntil: support?.expires_at || null,
      canVerify,
      sourceCutoff: warehouse.source_cutoff,
      sourceSyncedAt: warehouse.source_synced_at,
      rows: data || [],
      count: count || 0,
      offset,
      limit,
      readOnlyStock: true,
    });
  } catch (error) {
    console.error('[bodega/stock-verification][GET]', error);
    return NextResponse.json({ error: 'No se pudo cargar la revisión de existencias.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await contextFor(request);
  if (!gate.ok) return gate.response;
  const { context } = gate;

  let body: Record<string, unknown>;
  try {
    const raw = await request.text();
    if (raw.length > 4000) throw new Error('invalid-body');
    body = JSON.parse(raw);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid-body');
  } catch {
    return NextResponse.json({ error: 'Revisa los datos del conteo.' }, { status: 400 });
  }
  const productId = String(body.canonicalProductId || '');
  const requestId = String(body.requestId || '');
  const countedQuantity = String(body.countedQuantity ?? '').trim();
  const note = String(body.note || '').trim();
  const evidenceReference = String(body.evidenceReference || '').trim();
  if (!UUID.test(productId) || !UUID.test(requestId) || !QUANTITY.test(countedQuantity)
      || body.confirmPhysicalCount !== true || note.length > 1000 || evidenceReference.length > 500) {
    return NextResponse.json({ error: 'Indica producto, cantidad contada y confirma que hiciste la revisión física.' }, { status: 400 });
  }

  try {
    const { data: profile, error: profileError } = await context.supabase
      .from('profiles').select('status').eq('id', context.userId)
      .eq('organization_id', context.organizationId).maybeSingle();
    if (profileError) throw profileError;
    if (profile?.status !== 'active') {
      return NextResponse.json({ error: 'Tu usuario debe estar activo para validar stock.' }, { status: 403 });
    }

    const { data: source, error: sourceError } = await context.supabase
      .from('bodega_central_stock_canonicalization_preview_v1')
      .select('warehouse_id,canonical_product_id,product_external_id,sku,unit_of_measure,source_quantity,source_cutoff,source_synced_at,source_identity_count')
      .eq('organization_id', context.organizationId)
      .eq('canonical_product_id', productId)
      .maybeSingle();
    if (sourceError) throw sourceError;
    const snapshot = source as SourceRow | null;
    if (!snapshot || Number(snapshot.source_identity_count) !== 1) {
      return NextResponse.json({ error: 'No se puede verificar este producto sin resolver antes su identidad.' }, { status: 409 });
    }

    const { data: assignment, error: assignmentError } = await context.supabase
      .from('bodega_stock_verifier_assignments').select('id,expires_at')
      .eq('organization_id', context.organizationId)
      .eq('warehouse_id', snapshot.warehouse_id)
      .eq('profile_id', context.userId).eq('is_active', true).maybeSingle();
    if (assignmentError) throw assignmentError;
    if (!assignment || (assignment.expires_at && Date.parse(assignment.expires_at) <= Date.now())) {
      return NextResponse.json({ error: 'No tienes una autorización vigente para confirmar conteos físicos.' }, { status: 403 });
    }

    // Optimistic source check: the reviewer must see the same Laudus cut as
    // the server. A subsequent source update requires a fresh confirmation.
    if (String(body.expectedSourceQuantity ?? '') !== String(snapshot.source_quantity)
        || String(body.expectedSourceSyncedAt ?? '') !== String(snapshot.source_synced_at ?? '')) {
      return NextResponse.json({ error: 'El stock de Laudus cambió. Actualiza antes de confirmar el conteo.' }, { status: 409 });
    }
    if (Math.abs(Number(countedQuantity) - Number(snapshot.source_quantity)) > 0.0000005 && note.length < 8) {
      return NextResponse.json({ error: 'Describe la diferencia encontrada (mínimo 8 caracteres).' }, { status: 400 });
    }

    const { data, error } = await context.supabase
      .from('bodega_stock_physical_verifications')
      .insert({
        organization_id: context.organizationId,
        warehouse_id: snapshot.warehouse_id,
        canonical_product_id: snapshot.canonical_product_id,
        product_external_id: snapshot.product_external_id,
        sku: snapshot.sku,
        unit_of_measure: snapshot.unit_of_measure,
        source_quantity: snapshot.source_quantity,
        source_cutoff: snapshot.source_cutoff,
        source_synced_at: snapshot.source_synced_at,
        counted_quantity: countedQuantity,
        verification_note: note || null,
        evidence_reference: evidenceReference || null,
        verified_by: context.userId,
        request_id: requestId,
      })
      .select('id,verified_at')
      .single();
    if (error) {
      if (error.code === '23505') {
        const { data: old } = await context.supabase.from('bodega_stock_physical_verifications')
          .select('id,verified_at,canonical_product_id,verified_by,counted_quantity')
          .eq('organization_id', context.organizationId).eq('request_id', requestId).maybeSingle();
        if (old && old.canonical_product_id === productId && old.verified_by === context.userId
            && Number(old.counted_quantity) === Number(countedQuantity)) {
          return NextResponse.json({ recorded: true, duplicate: true, verifiedAt: old.verified_at, stockChanged: false });
        }
        return NextResponse.json({ error: 'Este registro ya se utilizó. Recarga la revisión.' }, { status: 409 });
      }
      throw error;
    }
    return NextResponse.json({ recorded: true, duplicate: false, verifiedAt: data.verified_at, stockChanged: false }, { status: 201 });
  } catch (error) {
    console.error('[bodega/stock-verification][POST]', error);
    return NextResponse.json({ error: 'No fue posible guardar el conteo. El stock no fue modificado.' }, { status: 500 });
  }
}
