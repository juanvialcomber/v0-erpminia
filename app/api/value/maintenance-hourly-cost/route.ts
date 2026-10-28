export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const managementRoles = new Set(['superadmin', 'admin']);
const allowedRoles = new Set(['planning', 'execution']);

function authorizedRole(role?: string | null) {
  return managementRoles.has(String(role || '').trim().toLowerCase());
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!authorizedRole(context.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const result = await context.supabase
    .from('audit_log')
    .select('resource_identifier,new_values,created_at,user_id')
    .eq('organization_id', context.organizationId)
    .eq('action', 'maintenance_value_hourly_cost')
    .eq('resource_type', 'maintenance_value_role_cost')
    .order('created_at', { ascending: false })
    .limit(100);

  if (result.error) {
    console.error('[value/maintenance-hourly-cost:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar los costos hora.' }, { status: 500 });
  }

  const latest = new Map<string, any>();
  for (const row of result.data || []) {
    const role = String(row.resource_identifier || '');
    if (allowedRoles.has(role) && !latest.has(role)) latest.set(role, row);
  }

  const roles = ['planning', 'execution'].map((role) => {
    const row = latest.get(role);
    const hourlyCostClp = Number(row?.new_values?.hourly_cost_clp);
    return {
      role,
      hourlyCostClp: Number.isFinite(hourlyCostClp) && hourlyCostClp > 0 ? Math.round(hourlyCostClp) : null,
      source: row?.new_values?.source || null,
      effectiveAt: row?.new_values?.effective_at || null,
      createdAt: row?.created_at || null,
      semantics: role === 'planning'
        ? 'loaded average hourly cost for planning/administrative OT opening work'
        : 'loaded average hourly cost for executor administrative OT closing work',
    };
  });

  return NextResponse.json({ roles });
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!authorizedRole(context.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const role = String(body?.role || '').trim().toLowerCase();
  const hourlyCostClp = Number(body?.hourlyCostClp);
  const source = String(body?.source || '').trim();
  const effectiveAt = String(body?.effectiveAt || '').trim();

  if (!allowedRoles.has(role)) {
    return NextResponse.json({ error: 'Rol de costo no válido.' }, { status: 400 });
  }
  if (!Number.isFinite(hourlyCostClp) || hourlyCostClp <= 0 || hourlyCostClp > 1_000_000) {
    return NextResponse.json({ error: 'El costo hora debe ser un valor CLP positivo y razonable.' }, { status: 400 });
  }
  if (source.length < 3 || source.length > 240) {
    return NextResponse.json({ error: 'Indica la fuente del costo hora validado.' }, { status: 400 });
  }

  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'maintenance_value_hourly_cost',
    resource_type: 'maintenance_value_role_cost',
    resource_identifier: role,
    new_values: {
      hourly_cost_clp: Math.round(hourlyCostClp),
      currency: 'CLP',
      source,
      effective_at: effectiveAt || new Date().toISOString(),
      metric_version: 'maintenance-value-hourly-cost-v1',
      semantics: role === 'planning'
        ? 'loaded average hourly cost for planning/administrative OT opening work'
        : 'loaded average hourly cost for executor administrative OT closing work',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[value/maintenance-hourly-cost:post]', result.error);
    return NextResponse.json({ error: 'No fue posible guardar el costo hora.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    role,
    hourlyCostClp: Math.round(hourlyCostClp),
  });
}
