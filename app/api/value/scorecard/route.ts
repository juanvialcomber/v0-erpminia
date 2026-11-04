export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
const managementRoles = new Set(['superadmin', 'admin']);

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const role = String(context.role || '').trim().toLowerCase();
  if (!managementRoles.has(role)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  try {
    const [current, history, financeReviews, financeTiming, financePriorityDecisions, maintenanceWorkOrders, maintenanceEvents, maintenanceSupplyChain, maintenanceAdminTiming, maintenanceSupervisorReviews, procurementAwardDecisions, procurementAwardOutcomes] = await Promise.all([
      context.supabase.rpc('motil_value_scorecard_preview', {
        p_organization_id: context.organizationId,
      }),
      context.supabase.rpc('motil_value_scorecard_history_preview', {
        p_organization_id: context.organizationId,
        p_limit: 90,
      }),
      context.supabase
        .from('laudus_finance_review_feedback_service_v1')
        .select('purchase_invoice_external_id,decision,outstanding_amount,created_at')
        .eq('organization_id', context.organizationId)
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'finance_review_decision')
        .eq('resource_type', 'laudus_purchase_invoice')
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'finance_priority_decision')
        .eq('resource_type', 'finance_priority')
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('maintenance_work_orders')
        .select('id,canonical_asset_id,asset_id,status,work_type,assigned_person_id,total_timer_seconds,actual_duration_hours,root_cause,preventive_actions,meter_reading,closed_at,created_at,created_by')
        .eq('organization_id', context.organizationId)
        .not('created_by', 'is', null)
        .limit(5000),
      context.supabase
        .from('work_order_events')
        .select('work_order_id,event_type,event_at')
        .eq('organization_id', context.organizationId)
        .limit(10000),
      context.supabase
        .from('work_order_supply_chain_v1')
        .select('work_order_id,material_requirement_count,material_shortage_count,procurement_request_count,procurement_order_count,parts_installed,procurement_order_amount,parts_cost')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'maintenance_ot_create_interaction')
        .eq('resource_type', 'maintenance_work_order')
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('work_order_supervisor_reviews')
        .select('work_order_id,status,reviewed_at')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('procurement_award_decisions')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('decided_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('procurement_award_outcomes_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('decided_at', { ascending: false })
        .limit(500),
    ]);

    if (current.error) throw current.error;
    if (history.error) throw history.error;
    if (financeReviews.error) throw financeReviews.error;
    if (financeTiming.error) throw financeTiming.error;
    if (financePriorityDecisions.error) throw financePriorityDecisions.error;
    if (maintenanceWorkOrders.error) throw maintenanceWorkOrders.error;
    if (maintenanceEvents.error) throw maintenanceEvents.error;
    if (maintenanceSupplyChain.error) throw maintenanceSupplyChain.error;
    if (maintenanceAdminTiming.error) throw maintenanceAdminTiming.error;
    if (maintenanceSupervisorReviews.error) throw maintenanceSupervisorReviews.error;
    if (procurementAwardDecisions.error) throw procurementAwardDecisions.error;
    if (procurementAwardOutcomes.error) throw procurementAwardOutcomes.error;

    const financeRows = financeReviews.data || [];
    const latestFinanceReviews = new Map<string, any>();
    for (const row of financeRows) {
      const key = String(row.purchase_invoice_external_id || '');
      if (key && !latestFinanceReviews.has(key)) latestFinanceReviews.set(key, row);
    }
    const financeReviewRows = Array.from(latestFinanceReviews.values());
    const reviewedAmountClp = financeReviewRows.reduce(
      (sum: number, row: any) => sum + (Number.isFinite(Number(row.outstanding_amount)) ? Number(row.outstanding_amount) : 0),
      0,
    );
    const acceptedAmountClp = financeReviewRows
      .filter((row: any) => row.decision === 'accepted')
      .reduce(
        (sum: number, row: any) => sum + (Number.isFinite(Number(row.outstanding_amount)) ? Number(row.outstanding_amount) : 0),
        0,
      );

    const financeReview = {
      total: financeReviewRows.length,
      reviewed: financeReviewRows.filter((row: any) => row.decision === 'accepted').length,
      deferred: financeReviewRows.filter((row: any) => row.decision === 'deferred').length,
      rejected: financeReviewRows.filter((row: any) => row.decision === 'rejected').length,
      reviewedAmountClp,
      acceptedAmountClp,
      latestAt: financeRows[0]?.created_at || null,
      calibrationGate: financeReviewRows.length >= 20 ? 'PASS' : 'HOLD',
      semantics: 'amount reviewed is value under human control, not savings or avoided cost',
    };

    const latestTimingByInvoice = new Map<string, number>();
    for (const row of financeTiming.data || []) {
      const key = String(row.resource_identifier || '');
      const latency = Number((row.new_values as any)?.decision_latency_ms);
      if (key && Number.isFinite(latency) && latency >= 0 && !latestTimingByInvoice.has(key)) {
        latestTimingByInvoice.set(key, latency);
      }
    }
    const timingValues = Array.from(latestTimingByInvoice.values()).sort((a, b) => a - b);
    const maintenanceCreateTimingByOrder = new Map<string, number>();
    for (const row of maintenanceAdminTiming.data || []) {
      const key = String(row.resource_identifier || '');
      const durationMs = Number((row.new_values as any)?.duration_ms);
      if (key && Number.isFinite(durationMs) && durationMs >= 1000 && durationMs <= 30 * 60 * 1000 && !maintenanceCreateTimingByOrder.has(key)) {
        maintenanceCreateTimingByOrder.set(key, durationMs);
      }
    }
    const maintenanceCreateTimingValues = Array.from(maintenanceCreateTimingByOrder.values()).sort((a, b) => a - b);
    const maintenanceCreateMidpoint = Math.floor(maintenanceCreateTimingValues.length / 2);
    const maintenanceCreateMedianMs =
      maintenanceCreateTimingValues.length === 0
        ? null
        : maintenanceCreateTimingValues.length % 2 === 0
          ? Math.round((maintenanceCreateTimingValues[maintenanceCreateMidpoint - 1] + maintenanceCreateTimingValues[maintenanceCreateMidpoint]) / 2)
          : maintenanceCreateTimingValues[maintenanceCreateMidpoint];

    const midpoint = Math.floor(timingValues.length / 2);
    const medianMs =
      timingValues.length === 0
        ? null
        : timingValues.length % 2 === 0
          ? Math.round((timingValues[midpoint - 1] + timingValues[midpoint]) / 2)
          : timingValues[midpoint];
    const financeReviewTiming = {
      sample: timingValues.length,
      medianSeconds: medianMs === null ? null : Math.round(medianMs / 1000),
      semantics: 'time from finance cockpit load to human decision; not manual baseline',
    };

    const chileBusinessDate = (value: string) => {
      const date = new Date(value);
      if (!Number.isFinite(date.getTime())) return null;
      const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santiago',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).formatToParts(date);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      return `${values.year}-${values.month}-${values.day}`;
    };
    const financePriorityRawRows = (financePriorityDecisions.data || [])
      .map((row: any) => ({
        decision: String(row.new_values?.decision || ''),
        priorityKey: String(row.new_values?.priority_key || ''),
        latencyMs: Number(row.new_values?.decision_latency_ms),
        businessDate: String(row.new_values?.business_date || '') || chileBusinessDate(String(row.created_at || '')),
        createdAt: row.created_at,
      }))
      .filter((row: any) =>
        ['accepted', 'deferred', 'rejected'].includes(row.decision)
        && ['freshness', 'overdue', 'due-soon', 'supplier-concentration', 'deposit', 'cost-centers', 'accounting'].includes(row.priorityKey),
      );
    const latestPriorityByDay = new Map<string, any>();
    for (const row of financePriorityRawRows) {
      const key = `${row.businessDate || 'unknown'}:${row.priorityKey}`;
      if (!latestPriorityByDay.has(key)) latestPriorityByDay.set(key, row);
    }
    const financePriorityRows = Array.from(latestPriorityByDay.values());
    const priorityLatencies = financePriorityRows
      .map((row: any) => row.latencyMs)
      .filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 30 * 60 * 1000)
      .sort((a: number, b: number) => a - b);
    const priorityMidpoint = Math.floor(priorityLatencies.length / 2);
    const priorityMedianMs =
      priorityLatencies.length === 0
        ? null
        : priorityLatencies.length % 2 === 0
          ? Math.round((priorityLatencies[priorityMidpoint - 1] + priorityLatencies[priorityMidpoint]) / 2)
          : priorityLatencies[priorityMidpoint];
    const financePriorityDecision = {
      total: financePriorityRows.length,
      accepted: financePriorityRows.filter((row: any) => row.decision === 'accepted').length,
      deferred: financePriorityRows.filter((row: any) => row.decision === 'deferred').length,
      rejected: financePriorityRows.filter((row: any) => row.decision === 'rejected').length,
      timedDecisions: priorityLatencies.length,
      medianDecisionSeconds: priorityMedianMs === null ? null : Math.round(priorityMedianMs / 1000),
      rawEvents: financePriorityRawRows.length,
      uniquePriorityDays: financePriorityRows.length,
      latestAt: financePriorityRows[0]?.createdAt || null,
      workflowLevel: financePriorityRows.length > 0 ? 4 : 3,
      evidenceLevel: financePriorityRows.length >= 20 ? 'E2' : financePriorityRows.length > 0 ? 'E1' : 'E0',
      valueGate: financePriorityRows.length >= 20 ? 'CALIBRATION_READY' : 'MEASURING',
      semantics: 'latest human decision per finance priority and Chile business day; repeated clicks do not inflate adoption; no Laudus or canonical mutation',
    };

    const maintenanceRows = maintenanceWorkOrders.data || [];
    const maintenanceEventRows = maintenanceEvents.data || [];
    const timerRows = maintenanceRows.filter(
      (row: any) => Number.isFinite(Number(row.total_timer_seconds)) && Number(row.total_timer_seconds) > 0,
    );
    const timerSecondsObserved = timerRows.reduce(
      (sum: number, row: any) => sum + Number(row.total_timer_seconds || 0),
      0,
    );
    const closedRows = maintenanceRows.filter((row: any) => Boolean(row.closed_at));
    const assignedRows = maintenanceRows.filter((row: any) => Boolean(row.assigned_person_id));
    const assetLinkedRows = maintenanceRows.filter((row: any) => Boolean(row.canonical_asset_id || row.asset_id));
    const rootCauseRows = maintenanceRows.filter((row: any) => Boolean(String(row.root_cause || '').trim()));
    const preventiveActionRows = maintenanceRows.filter((row: any) => Boolean(String(row.preventive_actions || '').trim()));
    const meterRows = maintenanceRows.filter((row: any) => row.meter_reading !== null && row.meter_reading !== undefined);
    const emergencyRows = maintenanceRows.filter((row: any) => row.work_type === 'emergency');
    const coveragePct = (count: number) => maintenanceRows.length > 0
      ? Math.round((count / maintenanceRows.length) * 100)
      : null;
    const workOrdersWithEvents = new Set(
      maintenanceEventRows.map((row: any) => String(row.work_order_id || '')).filter(Boolean),
    );
    const supplyRows = maintenanceSupplyChain.data || [];
    const withMaterials = supplyRows.filter((row: any) => Number(row.material_requirement_count || 0) > 0).length;
    const withShortages = supplyRows.filter((row: any) => Number(row.material_shortage_count || 0) > 0).length;
    const withProcurementRequests = supplyRows.filter((row: any) => Number(row.procurement_request_count || 0) > 0).length;
    const withPurchaseOrders = supplyRows.filter((row: any) => Number(row.procurement_order_count || 0) > 0).length;
    const withPartsInstalled = supplyRows.filter((row: any) => Number(row.parts_installed || 0) > 0).length;
    const procurementCommitment = supplyRows.reduce(
      (sum: number, row: any) => sum + (Number.isFinite(Number(row.procurement_order_amount)) ? Number(row.procurement_order_amount) : 0),
      0,
    );
    const tracedPartsCost = supplyRows.reduce(
      (sum: number, row: any) => sum + (Number.isFinite(Number(row.parts_cost)) ? Number(row.parts_cost) : 0),
      0,
    );
    const connectedDomains = [
      maintenanceRows.length > 0 ? 'Mantención' : null,
      withMaterials > 0 || withPartsInstalled > 0 ? 'Bodega' : null,
      withProcurementRequests > 0 || withPurchaseOrders > 0 ? 'Compras' : null,
      procurementCommitment > 0 ? 'Finanzas' : null,
    ].filter(Boolean);

    const eventTimes = new Map<string, { detected?: string; created?: string; start?: string; close?: string }>();
    for (const row of maintenanceEventRows) {
      const key = String(row.work_order_id || '');
      if (!key) continue;
      const current = eventTimes.get(key) || {};
      const at = String(row.event_at || '');
      if (row.event_type === 'emergency_detected' && (!current.detected || at < current.detected)) current.detected = at;
      if (row.event_type === 'work_order_created' && (!current.created || at < current.created)) current.created = at;
      if (row.event_type === 'timer_play' && (!current.start || at < current.start)) current.start = at;
      if (row.event_type === 'work_order_closed' && (!current.close || at > current.close)) current.close = at;
      eventTimes.set(key, current);
    }
    const latestReviewByOrder = new Map<string, any>();
    for (const row of maintenanceSupervisorReviews.data || []) {
      const key = String(row.work_order_id || '');
      const reviewedAt = String(row.reviewed_at || '');
      const current = latestReviewByOrder.get(key);
      if (
        key
        && reviewedAt
        && (!current || Date.parse(reviewedAt) > Date.parse(String(current.reviewed_at || '')))
      ) {
        latestReviewByOrder.set(key, row);
      }
    }
    const approvedReviewByOrder = new Map<string, string>();
    for (const [key, row] of latestReviewByOrder.entries()) {
      const reviewedAt = String(row.reviewed_at || '');
      if (row.status === 'approved' && reviewedAt) approvedReviewByOrder.set(key, reviewedAt);
    }
    const closeToReviewSeconds = closedRows
      .map((row: any) => {
        const review = latestReviewByOrder.get(String(row.id));
        if (!review?.reviewed_at || !row.closed_at) return null;
        const closedMs = Date.parse(String(row.closed_at));
        const reviewedMs = Date.parse(String(review.reviewed_at));
        return Number.isFinite(closedMs) && Number.isFinite(reviewedMs) && reviewedMs >= closedMs
          ? Math.round((reviewedMs - closedMs) / 1000)
          : null;
      })
      .filter((value): value is number => value !== null);
    const sortedReviewLatency = [...closeToReviewSeconds].sort((a, b) => a - b);
    const reviewLatencyMidpoint = Math.floor(sortedReviewLatency.length / 2);
    const medianCloseToReviewSeconds =
      sortedReviewLatency.length === 0
        ? null
        : sortedReviewLatency.length % 2 === 0
          ? Math.round(
              (sortedReviewLatency[reviewLatencyMidpoint - 1] + sortedReviewLatency[reviewLatencyMidpoint]) / 2,
            )
          : sortedReviewLatency[reviewLatencyMidpoint];
    const reviewedClosed = closedRows.filter((row: any) => latestReviewByOrder.has(String(row.id))).length;
    const approvedClosed = closedRows.filter(
      (row: any) => latestReviewByOrder.get(String(row.id))?.status === 'approved',
    ).length;
    const supervisorReview = {
      reviewedClosed,
      approvedClosed,
      nonApprovedClosed: reviewedClosed - approvedClosed,
      coveragePct: closedRows.length > 0 ? Math.round((reviewedClosed / closedRows.length) * 100) : null,
      medianCloseToReviewSeconds,
      latencySamples: sortedReviewLatency.length,
      semantics: 'latest human supervisor review per closed work order; approval rate is workflow evidence, not proof of repair quality',
    };

    const emergencyCycleRows = emergencyRows.map((row: any) => {
      const times = eventTimes.get(String(row.id)) || {};
      const detectedMs = times.detected ? Date.parse(times.detected) : NaN;
      const registeredMs = Date.parse(String(row.created_at || ''));
      const startMs = times.start ? Date.parse(times.start) : NaN;
      const closeMs = row.closed_at ? Date.parse(String(row.closed_at)) : times.close ? Date.parse(times.close) : NaN;
      const approvedAt = approvedReviewByOrder.get(String(row.id));
      const approvedMs = approvedAt ? Date.parse(approvedAt) : NaN;
      return {
        detectedToRegisteredSeconds: Number.isFinite(detectedMs) && Number.isFinite(registeredMs) && registeredMs >= detectedMs
          ? Math.round((registeredMs - detectedMs) / 1000)
          : null,
        registeredToStartSeconds: Number.isFinite(registeredMs) && Number.isFinite(startMs) && startMs >= registeredMs
          ? Math.round((startMs - registeredMs) / 1000)
          : null,
        startToCloseSeconds: Number.isFinite(startMs) && Number.isFinite(closeMs) && closeMs >= startMs
          ? Math.round((closeMs - startMs) / 1000)
          : null,
        closeToApprovalSeconds: Number.isFinite(closeMs) && Number.isFinite(approvedMs) && approvedMs >= closeMs
          ? Math.round((approvedMs - closeMs) / 1000)
          : null,
        endToEndSeconds: Number.isFinite(detectedMs) && Number.isFinite(approvedMs) && approvedMs >= detectedMs
          ? Math.round((approvedMs - detectedMs) / 1000)
          : null,
      };
    });

    const median = (values: Array<number | null>) => {
      const clean = values.filter((value): value is number => value !== null).sort((a, b) => a - b);
      if (clean.length === 0) return { samples: 0, medianSeconds: null as number | null };
      const middle = Math.floor(clean.length / 2);
      return {
        samples: clean.length,
        medianSeconds: clean.length % 2 === 0
          ? Math.round((clean[middle - 1] + clean[middle]) / 2)
          : clean[middle],
      };
    };

    const emergencyCycle = {
      detectedToRegistered: median(emergencyCycleRows.map((row) => row.detectedToRegisteredSeconds)),
      registeredToStart: median(emergencyCycleRows.map((row) => row.registeredToStartSeconds)),
      startToClose: median(emergencyCycleRows.map((row) => row.startToCloseSeconds)),
      closeToApproval: median(emergencyCycleRows.map((row) => row.closeToApprovalSeconds)),
      endToEnd: median(emergencyCycleRows.map((row) => row.endToEndSeconds)),
      semantics: 'OTe event chain from operator-reported detection to human supervisor approval; missing timestamps remain unmeasured',
    };

    const executionCycles = Array.from(eventTimes.values())
      .map((row) => {
        const startMs = row.start ? Date.parse(row.start) : NaN;
        const closeMs = row.close ? Date.parse(row.close) : NaN;
        return Number.isFinite(startMs) && Number.isFinite(closeMs) && closeMs >= startMs
          ? Math.round((closeMs - startMs) / 1000)
          : null;
      })
      .filter((value): value is number => value !== null)
      .sort((a, b) => a - b);
    const executionMidpoint = Math.floor(executionCycles.length / 2);
    const medianExecutionCycleSeconds =
      executionCycles.length === 0
        ? null
        : executionCycles.length % 2 === 0
          ? Math.round((executionCycles[executionMidpoint - 1] + executionCycles[executionMidpoint]) / 2)
          : executionCycles[executionMidpoint];

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
    const executionByWeek = new Map<string, number[]>();
    for (const row of maintenanceRows) {
      const week = weekStartUtc(String(row.created_at || ''));
      if (!week) continue;
      const times = eventTimes.get(String(row.id)) || {};
      const startMs = times.start ? Date.parse(times.start) : NaN;
      const closeMs = row.closed_at
        ? Date.parse(String(row.closed_at))
        : times.close
          ? Date.parse(times.close)
          : NaN;
      if (!Number.isFinite(startMs) || !Number.isFinite(closeMs) || closeMs < startMs) continue;
      const values = executionByWeek.get(week) || [];
      values.push(Math.round((closeMs - startMs) / 1000));
      executionByWeek.set(week, values);
    }
    const weeklyExecutionTrend = Array.from(executionByWeek.entries())
      .map(([week, values]) => {
        const measurement = median(values);
        return {
          week,
          samples: measurement.samples,
          medianSeconds: measurement.medianSeconds,
        };
      })
      .sort((a, b) => a.week.localeCompare(b.week));
    const currentWeekStart = weekStartUtc(new Date().toISOString());
    const comparableWeeklyExecutionTrend = weeklyExecutionTrend.filter(
      (row) => row.samples >= 5 && row.week !== currentWeekStart,
    );
    const previousComparableWeek =
      comparableWeeklyExecutionTrend.length >= 2
        ? comparableWeeklyExecutionTrend[comparableWeeklyExecutionTrend.length - 2]
        : null;
    const latestComparableWeek =
      comparableWeeklyExecutionTrend.length >= 1
        ? comparableWeeklyExecutionTrend[comparableWeeklyExecutionTrend.length - 1]
        : null;
    const weeklyExecutionChangePct =
      previousComparableWeek?.medianSeconds != null
      && latestComparableWeek?.medianSeconds != null
      && previousComparableWeek.medianSeconds > 0
        ? Math.round(
            ((latestComparableWeek.medianSeconds - previousComparableWeek.medianSeconds)
              / previousComparableWeek.medianSeconds) * 100,
          )
        : null;
    const executionTrend = {
      weeks: weeklyExecutionTrend,
      comparableWeeks: comparableWeeklyExecutionTrend.length,
      previousComparableWeek,
      latestComparableWeek,
      changePct: weeklyExecutionChangePct,
      evidenceGate: comparableWeeklyExecutionTrend.length >= 2 ? 'TREND_ONLY' : 'INSUFFICIENT_SAMPLE',
      e3Gate: 'HOLD_E3',
      semantics:
        'observational weekly execution-cycle trend; week-over-week change is not causal attribution to MOTIL and does not prove saved downtime',
    };


    const closedMaintenanceRows = maintenanceRows
      .filter((row: any) => row.closed_at)
      .map((row: any) => ({
        ...row,
        closedAtMs: Date.parse(String(row.closed_at)),
      }))
      .filter((row: any) => Number.isFinite(row.closedAtMs));
    const maintenanceByAsset = new Map<string, any[]>();
    for (const row of maintenanceRows) {
      const assetId = String((row as any).canonical_asset_id || '');
      if (!assetId) continue;
      const rows = maintenanceByAsset.get(assetId) || [];
      rows.push(row);
      maintenanceByAsset.set(assetId, rows);
    }
    const nowMs = Date.now();
    let matured7d = 0;
    let recurrent7d = 0;
    for (const row of closedMaintenanceRows) {
      if (row.closedAtMs > nowMs - 7 * 86400000) continue;
      matured7d += 1;
      const assetId = String((row as any).canonical_asset_id || '');
      if (!assetId) continue;
      const recurrent = (maintenanceByAsset.get(assetId) || []).some((candidate: any) => {
        if (candidate.id === row.id) return false;
        const createdMs = Date.parse(String(candidate.created_at || ''));
        return Number.isFinite(createdMs) && createdMs > row.closedAtMs && createdMs <= row.closedAtMs + 7 * 86400000;
      });
      if (recurrent) recurrent7d += 1;
    }
    const recurrence7dPct = matured7d > 0 ? Math.round((recurrent7d / matured7d) * 100) : null;

    const supplyEventTimes = new Map<string, { shortage?: number; procurement?: number }>();
    for (const row of maintenanceEventRows) {
      const key = String(row.work_order_id || '');
      if (!key) continue;
      const current = supplyEventTimes.get(key) || {};
      const atMs = Date.parse(String(row.event_at || ''));
      if (!Number.isFinite(atMs)) continue;
      if (row.event_type === 'supply_need_refreshed' && current.shortage == null) current.shortage = atMs;
      if (row.event_type === 'procurement_intake_created' && current.procurement == null) current.procurement = atMs;
      supplyEventTimes.set(key, current);
    }
    const shortageToProcurementSeconds = Array.from(supplyEventTimes.values())
      .map((row) => row.shortage != null && row.procurement != null && row.procurement >= row.shortage
        ? Math.round((row.procurement - row.shortage) / 1000)
        : null)
      .filter((value): value is number => value !== null)
      .sort((a,b)=>a-b);
    const shortageMidpoint = Math.floor(shortageToProcurementSeconds.length / 2);
    const medianShortageToProcurementSeconds =
      shortageToProcurementSeconds.length === 0
        ? null
        : shortageToProcurementSeconds.length % 2 === 0
          ? Math.round((shortageToProcurementSeconds[shortageMidpoint - 1] + shortageToProcurementSeconds[shortageMidpoint]) / 2)
          : shortageToProcurementSeconds[shortageMidpoint];

    const isUatAwardEvidence = (row: any) =>
      String(row?.evidence_scope || '').toLowerCase() === 'uat'
      || /^uat\b/i.test(String(row?.decision_notes || '').trim());

    const awardDecisionRows = procurementAwardDecisions.data || [];
    const awardOutcomeRows = procurementAwardOutcomes.data || [];
    const operationalAwardDecisions = awardDecisionRows.filter((row: any) => !isUatAwardEvidence(row));
    const uatAwardDecisions = awardDecisionRows.filter((row: any) => isUatAwardEvidence(row));
    const operationalAwardOutcomes = awardOutcomeRows.filter((row: any) => !isUatAwardEvidence(row));
    const deliveredOperationalOutcomes = operationalAwardOutcomes.filter((row: any) => row.actual_delivery_date);
    const closedOperationalOutcomes = operationalAwardOutcomes.filter((row: any) => row.outcome_state === 'closed');

    const procurementAwardValue = {
      totalDecisions: awardDecisionRows.length,
      operationalDecisions: operationalAwardDecisions.length,
      uatDecisions: uatAwardDecisions.length,
      operationalOutcomes: operationalAwardOutcomes.length,
      deliveredOperationalOutcomes: deliveredOperationalOutcomes.length,
      closedOperationalOutcomes: closedOperationalOutcomes.length,
      acceptanceSample: operationalAwardOutcomes.filter((row: any) => row.acceptance_rate_pct != null).length,
      invoiceOutcomeSample: operationalAwardOutcomes.filter((row: any) => row.clean_invoice_rate_pct != null).length,
      evidenceLevel:
        closedOperationalOutcomes.length >= 10 ? 'E3'
          : deliveredOperationalOutcomes.length > 0 ? 'E2'
            : operationalAwardDecisions.length > 0 ? 'E1'
              : 'E0',
      workflowLevel: 4,
      valueGate: operationalAwardDecisions.length > 0 ? 'MEASURING' : 'NO_OPERATIONAL_SAMPLE',
      semantics: 'controlled UAT/test award decisions remain traceable but are excluded from operational adoption, outcomes and ROI evidence',
    };

    const maintenanceValue = {
      workOrders: maintenanceRows.length,
      closedWorkOrders: closedRows.length,
      timerInstrumentedWorkOrders: timerRows.length,
      timerCoverage: coveragePct(timerRows.length),
      assignmentCoverage: coveragePct(assignedRows.length),
      assetCoverage: coveragePct(assetLinkedRows.length),
      rootCauseCoverage: coveragePct(rootCauseRows.length),
      preventiveActionCoverage: coveragePct(preventiveActionRows.length),
      meterCoverage: coveragePct(meterRows.length),
      assignmentCoverageCount: assignedRows.length,
      assetCoverageCount: assetLinkedRows.length,
      rootCauseCoverageCount: rootCauseRows.length,
      preventiveActionCoverageCount: preventiveActionRows.length,
      meterCoverageCount: meterRows.length,
      emergencyWorkOrders: emergencyRows.length,
      emergencyCycle,
      supervisorReview,
      observedExecutionSeconds: timerSecondsObserved,
      observedExecutionHours: Math.round((timerSecondsObserved / 3600) * 10) / 10,
      workOrdersWithEvents: workOrdersWithEvents.size,
      eventCount: maintenanceEventRows.length,
      measurableExecutionCycles: executionCycles.length,
      medianExecutionCycleSeconds,
      recurrence7d: {
        matured: matured7d,
        recurrent: recurrent7d,
        ratePct: recurrence7dPct,
        semantics: 'new work order on the same canonical asset within 7 days after closure; baseline only, not causal attribution',
      },
      shortageToProcurement: {
        samples: shortageToProcurementSeconds.length,
        medianSeconds: medianShortageToProcurementSeconds,
        semantics: 'time from first supply_need_refreshed event to procurement_intake_created; human-confirmed handoff',
      },
      medianExecutionCycleHours:
        medianExecutionCycleSeconds === null
          ? null
          : Math.round((medianExecutionCycleSeconds / 3600) * 100) / 100,
      executionTrend,
      evidenceLevel:
        timerRows.length >= 10 && maintenanceEventRows.length >= 50 ? 'E2' : timerRows.length > 0 ? 'E1' : 'E0',
      workflowLevel: timerRows.length > 0 && maintenanceEventRows.length > 0 ? 4 : maintenanceRows.length > 0 ? 2 : 0,
      connectedDomains,
      connectedDomainCount: connectedDomains.length,
      supplyChain: {
        workOrders: supplyRows.length,
        withMaterials,
        withShortages,
        withProcurementRequests,
        withPurchaseOrders,
        withPartsInstalled,
        procurementCommitment,
        tracedPartsCost,
      },
      adminInteraction: {
        creationSamples: maintenanceCreateTimingValues.length,
        medianCreateSeconds: maintenanceCreateMedianMs === null ? null : Math.round(maintenanceCreateMedianMs / 1000),
        semantics: 'active interaction from first input on OT creation form to successful creation; excludes mechanical execution and waiting',
      },
      valueGate: {
        attribution: 'NO_MEDIBLE_AUN',
        pricingReadiness: 'MARKET_ANCHORED',
        nextMeasurement: 'Minutos administrativos por OT antes de MOTIL versus con MOTIL.',
        semantics: 'coverage and workflow evidence are observed; savings, avoided downtime and ROI require a comparable baseline and attributable outcome',
      },
      semantics: 'observed maintenance execution and traceability; not saved time, avoided downtime, or economic ROI; execution cycle is first timer start to work-order closure',
    };

    return NextResponse.json({
      current: current.data || null,
      financeReview,
      financeReviewTiming,
      financePriorityDecision,
      maintenanceValue,
      procurementAwardValue,
      history: history.data || null,
      definitions: {
        workflow: {
          L1: 'Conectividad',
          L2: 'Visibilidad operacional',
          L3: 'Inteligencia',
          L4: 'Decisión asistida',
          L5: 'Autonomía controlada',
        },
        evidence: {
          E0: 'Narrativa',
          E1: 'Volumen y cobertura',
          E2: 'Desempeño medido',
          E3: 'Impacto observado',
          E4: 'Valor recurrente',
        },
      },
    });
  } catch (error) {
    console.error('[value/scorecard]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar el scorecard de valor' },
      { status: 500 },
    );
  }
}
