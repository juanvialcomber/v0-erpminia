export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const result = await context.supabase
    .from('audit_log')
    .select('new_values,created_at,user_id')
    .eq('organization_id', context.organizationId)
    .eq('action', 'finance_review_manual_baseline')
    .eq('resource_type', 'finance_review_baseline')
    .order('created_at', { ascending: false })
    .limit(100);

  if (result.error) {
    console.error('[value/finance-baseline:get]', result.error);
    return NextResponse.json({ error: 'No fue posible cargar el baseline.' }, { status: 500 });
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
    semantics: 'manual Laudus review timed outside MOTIL assistance',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const durationMs = Number(body?.durationMs);
  const caseCount = Number(body?.caseCount);

  if (
    !Number.isFinite(durationMs) ||
    durationMs < 10_000 ||
    durationMs > 60 * 60 * 1000 ||
    !Number.isInteger(caseCount) ||
    caseCount < 1 ||
    caseCount > 20
  ) {
    return NextResponse.json(
      { error: 'La medición debe tener entre 10 minutos? No: al menos 10 segundos, máximo 60 minutos y entre 1 y 20 casos.' },
      { status: 400 },
    );
  }

  const result = await context.supabase.from('audit_log').insert({
    organization_id: context.organizationId,
    user_id: context.userId,
    action: 'finance_review_manual_baseline',
    resource_type: 'finance_review_baseline',
    resource_identifier: `manual-${new Date().toISOString()}`,
    new_values: {
      duration_ms: Math.round(durationMs),
      case_count: caseCount,
      seconds_per_case: Math.round(durationMs / caseCount / 1000),
      metric_version: 'finance-review-baseline-v1',
      semantics: 'manual Laudus review timed outside MOTIL assistance',
    },
    user_agent: request.headers.get('user-agent'),
    status: 'completed',
  });

  if (result.error) {
    console.error('[value/finance-baseline:post]', result.error);
    return NextResponse.json({ error: 'No fue posible guardar el baseline.' }, { status: 409 });
  }

  return NextResponse.json({
    ok: true,
    caseCount,
    durationMs: Math.round(durationMs),
    secondsPerCase: Math.round(durationMs / caseCount / 1000),
  });
}
