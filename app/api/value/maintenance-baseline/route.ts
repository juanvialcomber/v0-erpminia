export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const managementRoles = new Set(['superadmin', 'admin']);

function authorizedRole(role?: string | null) {
  return managementRoles.has(String(role || '').trim().toLowerCase());
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!authorizedRole(context.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const phase = request.nextUrl.searchParams.get('phase') === 'close' ? 'close' : 'open';
  const action = phase === 'close' ? 'maintenance_admin_manual_close_baseline' : 'maintenance_admin_manual_baseline';
  const semantics = phase === 'close'
    ? 'manual OT administrative closure measured outside MOTIL assistance; includes documentation and close confirmation only, excludes mechanical execution and waiting'
    : 'manual OT opening and initial assignment measured outside MOTIL assistance; excludes mechanical execution, waiting, later updates and closure';

  const result = await context.supabase
    .from('audit_log')
    .select('new_values,created_at,user_id')
    .eq('organization_id', context.organizationId)
    .eq('action', action)
    .eq('resource_type', 'maintenance_admin_baseline')
    .order('created_at', { ascending: false })
    .limit(100);

  if (result.error) {
    console.error('[value/maintenance-baseline:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar el baseline de Mantención.' }, { status: 500 });
  }

  const samples = (result.data || [])
    .map((row: any) => ({
      durationMs: Number(row.new_values?.duration_ms),
      caseCount: Number(row.new_values?.case_count),
      createdAt: row.created_at,
    }))
    .filter(
      (row: any) =>
        Number.isFinite(row.durationMs) &&
        row.durationMs > 0 &&
        Number.isFinite(row.caseCount) &&
        row.caseCount > 0,
    );

  const perCaseSeconds = samples
    .map((row: any) => row.durationMs / row.caseCount / 1000)
    .sort((a: number, b: number) => a - b);

  const midpoint = Math.floor(perCaseSeconds.length / 2);
  const medianSeconds =
    perCaseSeconds.length === 0
      ? null
      : perCaseSeconds.length % 2 === 0
        ? Math.round((perCaseSeconds[midpoint - 1] + perCaseSeconds[midpoint]) / 2)
        : Math.round(perCaseSeconds[midpoint]);

  return NextResponse.json({
    sampleCount: samples.length,
    medianSecondsPerCase: medianSeconds,
    latestAt: samples[0]?.createdAt || null,
    phase,
    semantics,
  });
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!authorizedRole(context.role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const body = await request.json().catch(() => null);
  const phase = body?.phase === 'close' ? 'close' : 'open';
  const durationMs = Number(body?.durationMs);
  const caseCount = Number(body?.caseCount);
  const action = phase === 'close' ? 'maintenance_admin_manual_close_baseline' : 'maintenance_admin_manual_baseline';
  const semantics = phase === 'close'
    ? 'manual OT administrative closure measured outside MOTIL assistance; includes documentation and close confirmation only, excludes mechanical execution and waiting'
    : 'manual OT opening and initial assignment measured outside MOTIL assistance; excludes mechanical execution, waiting, later updates and closure';

  if (
    !Number.isFinite(durationMs) ||
    durationMs < 10_000 ||
    durationMs > 90 * 60 * 1000 ||
    !Number.isInteger(caseCount) ||
    caseCount < 1 ||
    caseCount > 20
  ) {
    return NextResponse.json(
      { error: phase === 'close'
          ? 'La medición debe durar entre 10 segundos y 90 minutos, con 1 a 20 cierres administrativos de OT.'
          : 'La medición debe durar entre 10 segundos y 90 minutos, con 1 a 20 aperturas de OT.' },
      { status: 400 },
    );
  }

  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action,
    resource_type: 'maintenance_admin_baseline',
    resource_identifier: `manual-${phase}-${new Date().toISOString()}`,
    new_values: {
      duration_ms: Math.round(durationMs),
      case_count: caseCount,
      seconds_per_case: Math.round(durationMs / caseCount / 1000),
      metric_version: phase === 'close' ? 'maintenance-close-baseline-v1' : 'maintenance-create-baseline-v1',
      phase,
      semantics,
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[value/maintenance-baseline:post]', result.error);
    return NextResponse.json({ error: 'No fue posible guardar el baseline de Mantención.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    phase,
    caseCount,
    durationMs: Math.round(durationMs),
    secondsPerCase: Math.round(durationMs / caseCount / 1000),
  });
}
