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
  const { data: links, error: linkError } = await ctx.supabase.rpc('list_hse_module_link_summary', {
    p_org: ctx.organizationId,
  });
  if (linkError) return NextResponse.json({ error: 'No se pudieron cargar las conexiones HSE' }, { status: 502 });
  return NextResponse.json({ controls: data || [], moduleLinks: links || [], readOnly: level !== 'ED' });
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

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  const level = await getModuleAccessLevel(ctx.userId, ctx.role, MODULE_KEYS.LEGAL_MODULO);
  if (level !== 'ED') return NextResponse.json({ error: 'Sin permiso para proponer conexiones HSE' }, { status: 403 });
  const body = await request.json().catch(() => null);
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const controlId = String(body?.controlId || '');
  const targetId = String(body?.targetId || '');
  const moduleName = String(body?.module || '');
  const note = String(body?.note || '').trim();
  if (!uuid.test(controlId) || !uuid.test(targetId) ||
      !['assets','people','maintenance'].includes(moduleName) ||
      note.length < 5 || note.length > 2000) {
    return NextResponse.json({ error: 'Datos de conexión inválidos' }, { status: 400 });
  }
  const { data, error } = await ctx.supabase.rpc('propose_hse_module_link', {
    p_org: ctx.organizationId, p_control: controlId,
    p_module: moduleName, p_target: targetId,
    p_actor: ctx.userId, p_note: note,
  });
  if (error) return NextResponse.json({ error: 'No fue posible proponer la conexión. Verifique que el control esté validado y que el destino pertenezca a la organización.' }, { status: 409 });
  return NextResponse.json({ id: data, status: 'pending' }, { status: 201 });
}
