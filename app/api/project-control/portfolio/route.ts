export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const headers = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const year = Number(request.nextUrl.searchParams.get('year') ?? '2027');
  if (!Number.isInteger(year) || year < 2027 || year > 2100) {
    return NextResponse.json({ error: 'Año presupuestario inválido' }, { status: 400, headers });
  }
  const { data, error } = await context.supabase.rpc('project_control_portfolio_v1', {
    p_organization_id: context.organizationId,
    p_actor_id: context.userId,
    p_year: year,
  });
  if (error?.code === '42501') return NextResponse.json({ error: 'Sin acceso al control de proyectos' }, { status: 403, headers });
  if (error || !data || !Array.isArray(data.projects) || !Array.isArray(data.centers)) {
    return NextResponse.json({ error: 'No se pudo consultar la cartera de proyectos' }, { status: 503, headers });
  }
  return NextResponse.json(data, { headers });
}
