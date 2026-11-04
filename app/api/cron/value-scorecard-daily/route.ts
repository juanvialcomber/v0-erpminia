import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

function chileBusinessDate(date = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function coverageLevel(percent: number | null) {
  if (percent === null) return 'C0';
  if (percent >= 95) return 'C5';
  if (percent >= 80) return 'C4';
  if (percent >= 50) return 'C3';
  if (percent >= 20) return 'C2';
  return 'C1';
}

async function capture(request: NextRequest) {
  const authHeader = request.headers.get('authorization');
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSupabaseServerClient();
  const snapshotDate = chileBusinessDate();

  const { data: organizations, error: organizationsError } = await supabase
    .from('organizations')
    .select('id')
    .order('id', { ascending: true });

  if (organizationsError) {
    console.error('[value-scorecard-daily] organizations:', organizationsError.message);
    return NextResponse.json({ error: 'No fue posible resolver organizaciones' }, { status: 500 });
  }

  const results: Array<{
    organizationId: string;
    evidenceLevel: string | null;
    workflowLevel: number | null;
    scaleGate: string | null;
    maintenanceLecv: string | null;
  }> = [];

  for (const organization of organizations || []) {
    const { data, error } = await supabase.rpc('motil_capture_value_scorecard_snapshot', {
      p_organization_id: organization.id,
      p_snapshot_date: snapshotDate,
    });

    if (error) {
      console.error(`[value-scorecard-daily] ${organization.id}:`, error.message);
      return NextResponse.json(
        { error: 'No fue posible capturar el snapshot diario de valor' },
        { status: 500 },
      );
    }

    const [workOrdersResult, eventsResult, evidenceResult, reviewsResult] = await Promise.all([
      supabase
        .from('maintenance_work_orders')
        .select('id,status,closed_at,created_at')
        .eq('organization_id', organization.id)
        .not('created_by', 'is', null)
        .limit(5000),
      supabase
        .from('work_order_events')
        .select('work_order_id,event_type,event_at')
        .eq('organization_id', organization.id)
        .limit(10000),
      supabase
        .from('work_order_evidence_files')
        .select('work_order_id')
        .eq('organization_id', organization.id)
        .limit(10000),
      supabase
        .from('work_order_supervisor_reviews')
        .select('work_order_id,status')
        .eq('organization_id', organization.id)
        .limit(5000),
    ]);

    for (const result of [workOrdersResult, eventsResult, evidenceResult, reviewsResult]) {
      if (result.error) {
        console.error(`[value-scorecard-daily] maintenance ${organization.id}:`, result.error.message);
        return NextResponse.json(
          { error: 'No fue posible capturar evidencia transversal de mantención' },
          { status: 500 },
        );
      }
    }

    const workOrders = workOrdersResult.data || [];
    const workOrderIds = new Set(workOrders.map((row) => String(row.id)));
    const closedIds = new Set(
      workOrders.filter((row) => Boolean(row.closed_at)).map((row) => String(row.id)),
    );
    const withEvents = new Set(
      (eventsResult.data || [])
        .map((row) => String(row.work_order_id || ''))
        .filter((id) => id && workOrderIds.has(id)),
    );
    const withEvidence = new Set(
      (evidenceResult.data || [])
        .map((row) => String(row.work_order_id || ''))
        .filter((id) => id && workOrderIds.has(id)),
    );
    const approvedReviews = new Set(
      (reviewsResult.data || [])
        .filter((row) => row.status === 'approved')
        .map((row) => String(row.work_order_id || ''))
        .filter((id) => id && workOrderIds.has(id)),
    );

    const eventCoveragePct = workOrders.length > 0
      ? Math.round((withEvents.size / workOrders.length) * 100)
      : null;

    const eventTimes = new Map<string, { start?: string; close?: string }>();
    for (const row of eventsResult.data || []) {
      const key = String(row.work_order_id || '');
      if (!key || !workOrderIds.has(key)) continue;
      const current = eventTimes.get(key) || {};
      const at = String(row.event_at || '');
      if (row.event_type === 'timer_play' && (!current.start || at < current.start)) current.start = at;
      if (row.event_type === 'work_order_closed' && (!current.close || at > current.close)) current.close = at;
      eventTimes.set(key, current);
    }
    const weekStartUtc = (value: string) => {
      const parsed = Date.parse(value);
      if (!Number.isFinite(parsed)) return null;
      const date = new Date(parsed);
      const day = date.getUTCDay();
      const diff = day === 0 ? -6 : 1 - day;
      date.setUTCDate(date.getUTCDate() + diff);
      date.setUTCHours(0, 0, 0, 0);
      return date.toISOString().slice(0, 10);
    };
    const median = (values: number[]) => {
      const clean = [...values].sort((a, b) => a - b);
      if (!clean.length) return null;
      const middle = Math.floor(clean.length / 2);
      return clean.length % 2 === 0
        ? Math.round((clean[middle - 1] + clean[middle]) / 2)
        : clean[middle];
    };
    const executionByWeek = new Map<string, number[]>();
    for (const row of workOrders) {
      const week = weekStartUtc(String((row as any).created_at || ''));
      if (!week) continue;
      const times = eventTimes.get(String(row.id)) || {};
      const startMs = times.start ? Date.parse(times.start) : NaN;
      const closeMs = (row as any).closed_at
        ? Date.parse(String((row as any).closed_at))
        : times.close
          ? Date.parse(times.close)
          : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(closeMs) || closeMs < startMs) continue;
      const values = executionByWeek.get(week) || [];
      values.push(Math.round((closeMs - startMs) / 1000));
      executionByWeek.set(week, values);
    }
    const weeklyExecutionTrend = Array.from(executionByWeek.entries())
      .map(([week, values]) => ({ week, samples: values.length, medianSeconds: median(values) }))
      .sort((a, b) => a.week.localeCompare(b.week));
    const comparableWeeks = weeklyExecutionTrend.filter((row) => row.samples >= 5);
    const previousComparableWeek = comparableWeeks.length >= 2 ? comparableWeeks[comparableWeeks.length - 2] : null;
    const latestComparableWeek = comparableWeeks.length >= 1 ? comparableWeeks[comparableWeeks.length - 1] : null;
    const weeklyExecutionChangePct =
      previousComparableWeek?.medianSeconds != null
      && latestComparableWeek?.medianSeconds != null
      && previousComparableWeek.medianSeconds > 0
        ? Math.round(
            ((latestComparableWeek.medianSeconds - previousComparableWeek.medianSeconds)
              / previousComparableWeek.medianSeconds) * 100,
          )
        : null;

    const evidenceCoveragePct = workOrders.length > 0
      ? Math.round((withEvidence.size / workOrders.length) * 100)
      : null;
    const supervisorReviewCoveragePct = closedIds.size > 0
      ? Math.round((Array.from(approvedReviews).filter((id) => closedIds.has(id)).length / closedIds.size) * 100)
      : null;

    const maintenanceEvidenceLevel = approvedReviews.size > 0 || withEvidence.size > 0
      ? 'E2'
      : workOrders.length > 0
        ? 'E1'
        : 'E0';
    const maintenanceWorkflowLevel = approvedReviews.size > 0 ? 'L4' : workOrders.length > 0 ? 'L3' : 'L1';
    const maintenanceCoverageLevel = coverageLevel(eventCoveragePct);
    const maintenanceValueLevel = approvedReviews.size > 0 ? 'V4' : workOrders.length > 0 ? 'V3' : 'V0';
    const maintenanceLecv = `${maintenanceWorkflowLevel} / ${maintenanceEvidenceLevel} / ${maintenanceCoverageLevel} / ${maintenanceValueLevel}`;

    const maintenanceValue = {
      workOrders: workOrders.length,
      closedWorkOrders: closedIds.size,
      workOrdersWithEvents: withEvents.size,
      workOrdersWithEvidence: withEvidence.size,
      approvedSupervisorReviews: approvedReviews.size,
      eventCoveragePct,
      evidenceCoveragePct,
      supervisorReviewCoveragePct,
      executionTrend: {
        weeks: weeklyExecutionTrend,
        comparableWeeks: comparableWeeks.length,
        previousComparableWeek,
        latestComparableWeek,
        changePct: weeklyExecutionChangePct,
        evidenceGate: comparableWeeks.length >= 2 ? 'TREND_ONLY' : 'INSUFFICIENT_SAMPLE',
        e3Gate: 'HOLD_E3',
        semantics: 'observational weekly execution-cycle trend; not causal attribution to MOTIL',
      },
      lecv: maintenanceLecv,
      attribution: 'NO_MEDIBLE_AUN',
      semantics: 'observed operational evidence and human review; not saved time, avoided downtime, or economic ROI',
    };

    const enrichedPayload = {
      ...(data || {}),
      maintenanceValue,
      lecv: {
        financeProcurement: {
          level: Number.isFinite(Number(data?.workflowLevel)) ? `L${Number(data.workflowLevel)}` : null,
          evidence: typeof data?.evidenceLevel === 'string' ? data.evidenceLevel : null,
          value: typeof data?.evidenceLevel === 'string' && data.evidenceLevel === 'E3' ? 'V5_CANDIDATE' : 'V4_OR_LOWER',
        },
        maintenance: maintenanceLecv,
      },
      snapshotSemantics: 'daily evidence snapshot; not audited savings or economic ROI',
    };

    const { error: enrichError } = await supabase
      .from('motil_value_scorecard_snapshots')
      .update({ scorecard_payload: enrichedPayload })
      .eq('organization_id', organization.id)
      .eq('snapshot_date', snapshotDate);

    if (enrichError) {
      console.error(`[value-scorecard-daily] enrich ${organization.id}:`, enrichError.message);
      return NextResponse.json(
        { error: 'No fue posible enriquecer el snapshot diario de valor' },
        { status: 500 },
      );
    }

    results.push({
      organizationId: organization.id,
      evidenceLevel: typeof data?.evidenceLevel === 'string' ? data.evidenceLevel : null,
      workflowLevel: Number.isFinite(Number(data?.workflowLevel)) ? Number(data.workflowLevel) : null,
      scaleGate: typeof data?.scaleGate === 'string' ? data.scaleGate : null,
      maintenanceLecv,
    });
  }

  return NextResponse.json({
    ok: true,
    snapshotDate,
    timeZone: 'America/Santiago',
    organizations: results.length,
    results,
    semantics: 'daily evidence snapshot; not audited savings or economic ROI',
  });
}

export async function GET(request: NextRequest) {
  return capture(request);
}

export async function POST(request: NextRequest) {
  return capture(request);
}
