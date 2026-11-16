export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

const privateHeaders = { 'Cache-Control': 'private, no-store' };
const ENGINEERING_CARGO = 'JEFE INGENIERIA Y PROYECTOS';
const FIELDS = 'id,project_name,requesting_area,need_summary,objective,location,target_date,source_reference,status,created_at,updated_at';

async function authorize(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok: false as const, response: context.response };

  const { data: profile, error: profileError } = await context.supabase.from('profiles')
    .select('cargo_id,status')
    .eq('id', context.userId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();
  if (profileError || profile?.status !== 'active' || !profile?.cargo_id) return {
    ok: false as const,
    response: NextResponse.json({ error: 'Perfil activo de Ingeniería no disponible' }, { status: 403, headers: privateHeaders }),
  };

  const { data: cargo, error: cargoError } = await context.supabase.from('cargos')
    .select('name')
    .eq('id', profile.cargo_id)
    .maybeSingle();
  if (cargoError || cargo?.name !== ENGINEERING_CARGO) return {
    ok: false as const,
    response: NextResponse.json({ error: 'Acceso reservado al cargo Jefe de Ingeniería y Proyectos' }, { status: 403, headers: privateHeaders }),
  };

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.PROD_TOPOGRAFIA);
  if (access !== 'ED' && access !== 'LEC') return {
    ok: false as const,
    response: NextResponse.json({ error: 'Sin acceso al espacio de Ingeniería' }, { status: 403, headers: privateHeaders }),
  };

  return { ok: true as const, context };
}

function parseDraft(body: unknown) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return null;
  const value = body as Record<string, unknown>;
  const text = (key: string, max: number, required = false) => {
    const item = typeof value[key] === 'string' ? value[key].trim() : '';
    if (required && !item) return null;
    if (item.length > max) return null;
    return item || null;
  };
  const projectName = text('project_name', 160, true);
  const requestingArea = text('requesting_area', 100, true);
  const needSummary = text('need_summary', 2500, true);
  const objective = text('objective', 1500);
  const location = text('location', 200);
  const sourceReference = text('source_reference', 1000);
  if (!projectName || !requestingArea || !needSummary) return null;

  const rawDate = typeof value.target_date === 'string' ? value.target_date.trim() : '';
  const targetDate = rawDate || null;
  if (targetDate && !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null;
  return {
    project_name: projectName,
    requesting_area: requestingArea,
    need_summary: needSummary,
    objective,
    location,
    target_date: targetDate,
    source_reference: sourceReference,
  };
}

export async function GET(request: NextRequest) {
  const resolved = await authorize(request);
  if (!resolved.ok) return resolved.response;

  const { data, error } = await resolved.context.supabase
    .from('engineering_project_intake_v1')
    .select(FIELDS)
    .eq('organization_id', resolved.context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(100);

  if (error) return NextResponse.json({ error: 'No se pudieron cargar las fichas de Ingeniería' }, { status: 503, headers: privateHeaders });
  return NextResponse.json({
    portfolio: { status: 'draft_intake', projects: data || [], total: data?.length || 0 },
    controls: { approvalsEnabled: false, budgetsConnected: false, verifiedPhysicalProgressAvailable: false },
    nextAction: 'Completar fichas iniciales y validar cartera con La Patagua.',
  }, { headers: privateHeaders });
}

export async function POST(request: NextRequest) {
  const resolved = await authorize(request);
  if (!resolved.ok) return resolved.response;
  const draft = parseDraft(await request.json().catch(() => null));
  if (!draft) return NextResponse.json({ error: 'Revisa los campos obligatorios y sus límites.' }, { status: 400, headers: privateHeaders });

  const { data, error } = await resolved.context.supabase
    .from('engineering_project_intake_v1')
    .insert({
      ...draft,
      organization_id: resolved.context.organizationId,
      created_by: resolved.context.userId,
      status: 'draft',
    })
    .select(FIELDS)
    .single();

  if (error || !data) return NextResponse.json({ error: 'No se pudo guardar el borrador.' }, { status: 503, headers: privateHeaders });
  return NextResponse.json({ project: data }, { status: 201, headers: privateHeaders });
}

export async function PATCH(request: NextRequest) {
  const resolved = await authorize(request);
  if (!resolved.ok) return resolved.response;
  const body = await request.json().catch(() => null);
  const id = body && typeof body.id === 'string' ? body.id : '';
  const draft = parseDraft(body);
  if (!id || !draft) return NextResponse.json({ error: 'Revisa el identificador y los campos obligatorios.' }, { status: 400, headers: privateHeaders });

  const { data, error } = await resolved.context.supabase
    .from('engineering_project_intake_v1')
    .update({ ...draft, updated_at: new Date().toISOString() })
    .eq('id', id)
    .eq('organization_id', resolved.context.organizationId)
    .eq('status', 'draft')
    .select(FIELDS)
    .maybeSingle();

  if (error) return NextResponse.json({ error: 'No se pudo actualizar el borrador.' }, { status: 503, headers: privateHeaders });
  if (!data) return NextResponse.json({ error: 'La ficha ya no está disponible para edición.' }, { status: 404, headers: privateHeaders });
  return NextResponse.json({ project: data }, { headers: privateHeaders });
}
