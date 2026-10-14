import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a controles HSE' }, { status: 403 });
  }
  const { data, error } = await ctx.supabase.rpc('list_hse_review_controls', {
    p_organization_id: ctx.organizationId,
  });
  if (error) return NextResponse.json({ error: 'No se pudieron cargar los controles HSE' }, { status: 502 });
  return NextResponse.json({ controls: data || [], readOnly: level !== 'ED' });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED') return NextResponse.json({ error: 'Sin permiso de revisión HSE' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const id = String(body?.id || '');
  const status = String(body?.status || '');
  const note = String(body?.note || '').trim();
  if (!/^[0-9a-f]{8}-[0-9a-f-]{27,}$/.test(id) || !['verified','rejected','pending'].includes(status) || note.length < 5 || note.length > 2000)
    return NextResponse.json({ error: 'Revisión inválida: indique estado y motivo (5 a 2000 caracteres)' }, { status: 400 });
  const { data, error } = await ctx.supabase.rpc('review_hse_control', {
    p_organization_id: ctx.organizationId,
    p_control_id: id,
    p_reviewer_user_id: ctx.userId,
    p_new_status: status,
    p_note: note,
  });
  if (error) return NextResponse.json({ error: 'No fue posible registrar la revisión HSE' }, { status: 409 });
  return NextResponse.json({ status: data });
}
