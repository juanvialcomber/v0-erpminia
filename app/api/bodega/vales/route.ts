export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { voucherContext } from '@/lib/bodega/voucher-context';
import { uuid, voucherInput } from '@/lib/bodega/voucher-input.mjs';

export async function GET(request: NextRequest) {
  const gate = await voucherContext(request);
  if (!gate.ok) return gate.response;
  const { context, access, settings } = gate;
  const db = context.supabase;
  const org = context.organizationId;
  try {
    const mode = request.nextUrl.searchParams.get('mode');
    if (mode === 'catalog') {
      const q = (request.nextUrl.searchParams.get('q') || '').slice(0, 80).replace(/[%_,().*"\\]/g, ' ').trim();
      if (q.length < 2) return NextResponse.json({ rows: [] });
      const { data, error } = await db.from('canonical_products_v1').select('id,product_code,name,unit').eq('organization_id', org).eq('is_active', true).eq('validation_status', 'valid').or(`product_code.ilike.%${q}%,name.ilike.%${q}%`).limit(30);
      if (error) throw error;
      return NextResponse.json({ rows: data });
    }
    let query = db.from('warehouse_consumption_vouchers').select('*,warehouse_consumption_voucher_lines(*)').eq('organization_id', org);
    if (!access.can_approve && !access.can_deliver) query = query.eq('requested_by', context.userId);
    const qr = request.nextUrl.searchParams.get('qr');
    if (qr) {
      if (!uuid(qr)) return NextResponse.json({ error: 'Código de vale inválido.' }, { status: 400 });
      query = query.eq('qr_reference', qr);
    }
    const [{ data: rows, error }, users, warehouses, orders, requesters] = await Promise.all([
      query.order('created_at', { ascending: false }).limit(100),
      db.from('profiles').select('id,full_name').eq('organization_id', org).eq('status', 'active').order('full_name').limit(500),
      db.from('warehouses').select('id,name,code').eq('organization_id', org).eq('code', '002'),
      db.from('maintenance_work_orders').select('id,work_order_number,title').eq('organization_id', org).not('created_by', 'is', null).not('status', 'in', '(completed,cancelled,closed)').order('created_at', { ascending: false }).limit(100),
      db.from('warehouse_voucher_access').select('profile_id,expires_at,profiles(full_name)').eq('organization_id', org).eq('can_request', true).gt('expires_at', new Date().toISOString()).limit(100),
    ]);
    if (error || users.error || warehouses.error || orders.error || requesters.error) throw error || users.error || warehouses.error || orders.error || requesters.error;
    return NextResponse.json({ rows, users: users.data, warehouses: warehouses.data, orders: orders.data, requesters: requesters.data, access, settings, actorId: context.userId }, { headers: { 'Cache-Control': 'private, no-store' } });
  } catch {
    return NextResponse.json({ error: 'No se pudieron cargar los vales.' }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  const gate = await voucherContext(request);
  if (!gate.ok) return gate.response;
  let action: string;
  let payload;
  try {
    const body = await request.json();
    action = body.action;
    if (action === 'create') payload = voucherInput(body.payload);
    else {
      payload = body.payload;
      if (!['approve', 'reject', 'deliver', 'cancel'].includes(action) || !uuid(payload?.voucherId) || !uuid(payload?.requestId)) throw new Error('Acción de vale inválida.');
      if (action === 'deliver' && (!uuid(payload.lineId) || !uuid(payload.qrReference) || !uuid(payload.receiverId) || payload.physicalConfirmed !== true)) throw new Error('Confirma la entrega física y el receptor del vale.');
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'Revisa los datos del vale.' }, { status: 400 });
  }
  const { data, error } = await gate.context.supabase.rpc('warehouse_voucher_command_v1', { p_org: gate.context.organizationId, p_actor: gate.context.userId, p_action: action, p_payload: payload });
  if (error) {
    const known: Record<string, string> = {
      not_authorized: 'No tienes permiso para esta acción o estás intentando aprobar tu propio vale.',
      weekend_policy_pending: 'La autorización de fin de semana está pendiente de definición.',
      delivery_activation_pending: 'Las entregas aún no están habilitadas.',
      decimal_stock_contract_pending: 'La entrega fraccionaria requiere validar primero el contrato decimal de inventario.',
      insufficient_available: 'No hay existencia disponible suficiente.',
      opening_pending: 'Falta la apertura verificada de este material.',
      idempotency_conflict: 'Este intento ya fue utilizado con otros datos. Actualiza el vale.',
      voucher_expired: 'El vale venció. Solicita uno nuevo.',
      invalid_state: 'El vale cambió de estado. Actualiza la lista.',
      invalid_qr_or_state: 'El QR no corresponde a un vale aprobado y vigente.',
      exceeds_voucher: 'La cantidad supera el saldo pendiente del vale.',
      ambiguous_stock: 'Bodega debe confirmar la posición de inventario de este material.',
    };
    return NextResponse.json({ error: known[error.message] || 'No se pudo registrar la acción. Revisa los datos y actualiza el vale.' }, { status: error.message === 'not_authorized' ? 403 : 409 });
  }
  return NextResponse.json({ voucher: data }, { status: action === 'create' ? 201 : 200 });
}
