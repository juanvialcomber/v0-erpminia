export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

type WorkOrderValueRow = {
  id: string;
  work_type: string | null;
  status: string | null;
  assigned_person_id: string | null;
  canonical_asset_id: string | null;
  asset_id: string | null;
  root_cause: string | null;
  preventive_actions: string | null;
  meter_reading: number | string | null;
  total_timer_seconds: number | null;
  created_at: string;
  closed_at: string | null;
};

function ratio(numerator: number, denominator: number) {
  return denominator > 0 ? Number((numerator / denominator).toFixed(4)) : null;
}

function rounded(value: number | null, digits = 1) {
  if (value == null || !Number.isFinite(value)) return null;
  return Number(value.toFixed(digits));
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const access = await getModuleAccessLevel(
      context.userId,
      context.role,
      MODULE_KEYS.MANT_OPERACIONES,
    );
    if (access === 'SR') {
      return NextResponse.json({ error: 'No tienes acceso a mantenimiento' }, { status: 403 });
    }

    const daysParam = Number(request.nextUrl.searchParams.get('days') || '30');
    const days = Number.isFinite(daysParam) ? Math.min(Math.max(Math.trunc(daysParam), 7), 90) : 30;
    const from = new Date();
    from.setUTCDate(from.getUTCDate() - days);

    const { data, error } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,work_type,status,assigned_person_id,canonical_asset_id,asset_id,root_cause,preventive_actions,meter_reading,total_timer_seconds,created_at,closed_at')
      .eq('organization_id', context.organizationId)
      .gte('created_at', from.toISOString())
      .not('created_by', 'is', null)
      .order('created_at', { ascending: true });

    if (error) throw error;

    const rows = (data || []) as WorkOrderValueRow[];
    const total = rows.length;
    const completed = rows.filter((row) => row.status === 'completed').length;
    const withAssignee = rows.filter((row) => Boolean(row.assigned_person_id)).length;
    const withAsset = rows.filter((row) => Boolean(row.canonical_asset_id || row.asset_id)).length;
    const withTimer = rows.filter((row) => Number(row.total_timer_seconds || 0) > 0);
    const withRootCause = rows.filter((row) => Boolean(row.root_cause?.trim())).length;
    const withPreventiveAction = rows.filter((row) => Boolean(row.preventive_actions?.trim())).length;
    const withMeter = rows.filter((row) => row.meter_reading !== null).length;
    const emergency = rows.filter((row) => row.work_type === 'emergency').length;

    const closedDurationsHours = rows
      .filter((row) => row.closed_at)
      .map((row) => {
        const start = new Date(row.created_at).getTime();
        const end = new Date(row.closed_at as string).getTime();
        return (end - start) / 3_600_000;
      })
      .filter((value) => Number.isFinite(value) && value >= 0);

    const timerMinutes = withTimer.map((row) => Number(row.total_timer_seconds || 0) / 60);

    const avgCloseHours = closedDurationsHours.length
      ? closedDurationsHours.reduce((sum, value) => sum + value, 0) / closedDurationsHours.length
      : null;
    const avgTimerMinutes = timerMinutes.length
      ? timerMinutes.reduce((sum, value) => sum + value, 0) / timerMinutes.length
      : null;

    return NextResponse.json({
      period: {
        days,
        from: from.toISOString(),
        to: new Date().toISOString(),
      },
      observed: {
        workOrders: total,
        completed,
        emergency,
        assignmentCoverage: { numerator: withAssignee, denominator: total, rate: ratio(withAssignee, total) },
        assetCoverage: { numerator: withAsset, denominator: total, rate: ratio(withAsset, total) },
        timerCoverage: { numerator: withTimer.length, denominator: total, rate: ratio(withTimer.length, total) },
        rootCauseCoverage: { numerator: withRootCause, denominator: total, rate: ratio(withRootCause, total) },
        preventiveActionCoverage: { numerator: withPreventiveAction, denominator: total, rate: ratio(withPreventiveAction, total) },
        meterCoverage: { numerator: withMeter, denominator: total, rate: ratio(withMeter, total) },
        avgCreateToCloseHours: rounded(avgCloseHours, 2),
        avgTimerMinutesWhenUsed: rounded(avgTimerMinutes, 1),
      },
      evidence: {
        level: 'E2',
        baselineStatus: 'missing',
        attribution: 'NO_MEDIBLE_AUN',
        note: 'Actividad y trazabilidad observadas. Falta baseline comparable para atribuir ahorro, ROI o reducción de downtime.',
      },
      value: {
        level: 'L4',
        vLevel: 'V4',
        pricingReadiness: 'MARKET_ANCHORED',
        nextMeasurement: 'Minutos administrativos por OT antes de MOTIL versus con MOTIL.',
      },
      source: {
        canonical: true,
        table: 'maintenance_work_orders',
        generatedAt: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('[maintenance/value-ledger:get]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo calcular el ledger de valor' },
      { status: 500 },
    );
  }
}
