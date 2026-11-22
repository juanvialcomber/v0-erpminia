export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

type CommitmentStatus = 'open' | 'in_progress' | 'blocked' | 'done';
const allowedStatuses = new Set<CommitmentStatus>(['open', 'in_progress', 'blocked', 'done']);

export async function GET(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  // Authentication and organization are resolved on the server. Never accept
  // client-supplied organization IDs or assignees as access authority.
  const isAdmin = ctx.role === 'superadmin' || ctx.role === 'admin';
  const showTeam = isAdmin && request.nextUrl.searchParams.get('scope') === 'team';
  let query = ctx.supabase
    .from('motil_operational_commitments')
    .select('id, assignee_profile_id, title, detail, domain, priority, status, due_date, source_reference, resolution_note, updated_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(100);
  if (!showTeam) query = query.eq('assignee_profile_id', ctx.userId);

  const { data, error } = await query;
  if (error) {
    console.error('[motil-commitments] read failed', error.code);
    return NextResponse.json({ error: 'No se pudieron consultar los compromisos' }, { status: 503 });
  }

  const rows = data || [];
  const profileIds = [...new Set(rows.map((row) => row.assignee_profile_id))];
  const people = profileIds.length
    ? await ctx.supabase
      .from('profiles')
      .select('id, full_name')
      .eq('organization_id', ctx.organizationId)
      .in('id', profileIds)
    : { data: [], error: null };
  if (people.error) {
    return NextResponse.json({ error: 'No se pudieron resolver los responsables' }, { status: 503 });
  }

  const names = new Map((people.data || []).map((p) => [p.id, p.full_name]));
  return NextResponse.json({
    items: rows.map((row) => ({
      ...row,
      assignee_name: names.get(row.assignee_profile_id) || 'Responsable asignado',
      can_update: row.assignee_profile_id === ctx.userId || isAdmin,
    })),
    scope: showTeam ? 'team' : 'mine',
    can_view_team: isAdmin,
    source: 'motil_operational_commitments',
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}

export async function PATCH(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;

  const body = await request.json().catch(() => null);
  const id = typeof body?.id === 'string' ? body.id : '';
  const status = typeof body?.status === 'string' ? body.status as CommitmentStatus : null;
  const note = typeof body?.note === 'string' ? body.note.trim() : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
      || !status || !allowedStatuses.has(status) || note.length > 2000) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
  if ((status === 'done' || status === 'blocked') && note.length < 8) {
    return NextResponse.json({ error: 'Indica el resultado o bloqueo (mínimo 8 caracteres)' }, { status: 400 });
  }

  const { data: current, error: readError } = await ctx.supabase
    .from('motil_operational_commitments')
    .select('id, assignee_profile_id, status')
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: 'No se pudo validar el compromiso' }, { status: 503 });
  if (!current) return NextResponse.json({ error: 'Compromiso no encontrado' }, { status: 404 });

  const isAdmin = ctx.role === 'superadmin' || ctx.role === 'admin';
  if (!isAdmin && current.assignee_profile_id !== ctx.userId) {
    return NextResponse.json({ error: 'No autorizado para actualizar este compromiso' }, { status: 403 });
  }
  if (current.status === 'done' && !isAdmin) {
    return NextResponse.json({ error: 'Un compromiso cerrado requiere revisión del administrador para reabrir' }, { status: 409 });
  }
  if (!isAdmin && status === 'open') {
    return NextResponse.json({ error: 'Sólo el administrador puede reabrir un compromiso' }, { status: 403 });
  }
  if (current.status === status) {
    return NextResponse.json({ error: 'El compromiso ya tiene ese estado' }, { status: 409 });
  }

  // Compare-and-swap avoids silent overwrites from concurrent users. The
  // database trigger logs the actor and transition in the same transaction.
  const { data: updated, error: writeError } = await ctx.supabase
    .from('motil_operational_commitments')
    .update({
      status,
      resolution_note: note || null,
      updated_by_profile_id: ctx.userId,
      updated_at: new Date().toISOString(),
    })
    .eq('organization_id', ctx.organizationId)
    .eq('id', id)
    .eq('status', current.status)
    .select('id, status, updated_at')
    .maybeSingle();

  if (writeError) {
    console.error('[motil-commitments] update failed', writeError.code);
    return NextResponse.json({ error: 'No se pudo actualizar el compromiso' }, { status: 503 });
  }
  if (!updated) return NextResponse.json({ error: 'El compromiso cambió; vuelve a cargar antes de continuar' }, { status: 409 });
  return NextResponse.json({ item: updated }, { headers: { 'Cache-Control': 'private, no-store' } });
}
