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
    const [current, history, financeReviews, financeTiming, maintenanceWorkOrders, maintenanceEvents, maintenanceSupplyChain, maintenanceCreateTiming, maintenanceCloseTiming, maintenanceManualOpenBaseline, maintenanceManualCloseBaseline, maintenanceHourlyCosts, maintenanceSupervisorReviews] = await Promise.all([
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
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'maintenance_ot_close_interaction')
        .eq('resource_type', 'maintenance_work_order')
        .order('created_at', { ascending: false })
        .limit(500),
      context.supabase
        .from('audit_log')
        .select('new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'maintenance_admin_manual_baseline')
        .eq('resource_type', 'maintenance_admin_baseline')
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('audit_log')
        .select('new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'maintenance_admin_manual_close_baseline')
        .eq('resource_type', 'maintenance_admin_baseline')
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('audit_log')
        .select('resource_identifier,new_values,created_at')
        .eq('organization_id', context.organizationId)
        .eq('action', 'maintenance_value_hourly_cost')
        .eq('resource_type', 'maintenance_value_role_cost')
        .order('created_at', { ascending: false })
        .limit(100),
      context.supabase
        .from('work_order_supervisor_reviews')
        .select('work_order_id,status,reviewed_at')
        .eq('organization_id', context.organizationId)
        .limit(5000),
    ]);

    if (current.error) throw current.error;
    if (history.error) throw history.error;
    if (financeReviews.error) throw financeReviews.error;
    if (financeTiming.error) throw financeTiming.error;
    if (maintenanceWorkOrders.error) throw maintenanceWorkOrders.error;
    if (maintenanceEvents.error) throw maintenanceEvents.error;
    if (maintenanceSupplyChain.error) throw maintenanceSupplyChain.error;
    if (maintenanceCreateTiming.error) throw maintenanceCreateTiming.error;
    if (maintenanceCloseTiming.error) throw maintenanceCloseTiming.error;
    if (maintenanceManualOpenBaseline.error) throw maintenanceManualOpenBaseline.error;
    if (maintenanceManualCloseBaseline.error) throw maintenanceManualCloseBaseline.error;
    if (maintenanceHourlyCosts.error) throw maintenanceHourlyCosts.error;
    if (maintenanceSupervisorReviews.error) throw maintenanceSupervisorReviews.error;

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
    for (const row of maintenanceCreateTiming.data || []) {
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

    const maintenanceCloseTimingByOrder = new Map<string, number>();
    for (const row of maintenanceCloseTiming.data || []) {
      const key = String(row.resource_identifier || '');
      const durationMs = Number((row.new_values as any)?.duration_ms);
      if (key && Number.isFinite(durationMs) && durationMs >= 1000 && durationMs <= 30 * 60 * 1000 && !maintenanceCloseTimingByOrder.has(key)) {
        maintenanceCloseTimingByOrder.set(key, durationMs);
      }
    }
    const maintenanceCloseTimingValues = Array.from(maintenanceCloseTimingByOrder.values()).sort((a, b) => a - b);
    const maintenanceCloseMidpoint = Math.floor(maintenanceCloseTimingValues.length / 2);
    const maintenanceCloseMedianMs =
      maintenanceCloseTimingValues.length === 0
        ? null
        : maintenanceCloseTimingValues.length % 2 === 0
          ? Math.round((maintenanceCloseTimingValues[maintenanceCloseMidpoint - 1] + maintenanceCloseTimingValues[maintenanceCloseMidpoint]) / 2)
          : maintenanceCloseTimingValues[maintenanceCloseMidpoint];

    const medianFromAudit = (rows: any[]) => {
      const values = rows
        .map((row: any) => {
          const durationMs = Number(row.new_values?.duration_ms);
          const caseCount = Number(row.new_values?.case_count);
          return Number.isFinite(durationMs) && durationMs > 0 && Number.isFinite(caseCount) && caseCount > 0
            ? durationMs / caseCount
            : null;
        })
        .filter((value: number | null): value is number => value !== null)
        .sort((a: number, b: number) => a - b);
      if (!values.length) return { samples: 0, medianMs: null as number | null };
      const middle = Math.floor(values.length / 2);
      const medianMs = values.length % 2 === 0
        ? Math.round((values[middle - 1] + values[middle]) / 2)
        : Math.round(values[middle]);
      return { samples: values.length, medianMs };
    };
    const manualOpen = medianFromAudit(maintenanceManualOpenBaseline.data || []);
    const manualClose = medianFromAudit(maintenanceManualCloseBaseline.data || []);
    const createComparisonReady = manualOpen.samples >= 3
      && maintenanceCreateTimingValues.length >= 10
      && manualOpen.medianMs !== null
      && maintenanceCreateMedianMs !== null
      && manualOpen.medianMs > 0;
    const closeComparisonReady = manualClose.samples >= 3
      && maintenanceCloseTimingValues.length >= 10
      && manualClose.medianMs !== null
      && maintenanceCloseMedianMs !== null
      && manualClose.medianMs > 0;
    const createReductionPct = createComparisonReady
      ? Math.round(((manualOpen.medianMs! - maintenanceCreateMedianMs!) / manualOpen.medianMs!) * 100)
      : null;
    const closeReductionPct = closeComparisonReady
      ? Math.round(((manualClose.medianMs! - maintenanceCloseMedianMs!) / manualClose.medianMs!) * 100)
      : null;
    const observedAdminComparisons = [
      createComparisonReady ? createReductionPct : null,
      closeComparisonReady ? closeReductionPct : null,
    ].filter((value): value is number => value !== null);
    const hasObservedComparison = observedAdminComparisons.length > 0;
    const hasPositiveOperationalImpact = observedAdminComparisons.some((value) => value > 0);

    const latestHourlyCostByRole = new Map<string, number>();
    for (const row of maintenanceHourlyCosts.data || []) {
      const role = String(row.resource_identifier || '');
      const hourlyCostClp = Number((row.new_values as any)?.hourly_cost_clp);
      if ((role === 'planning' || role === 'execution')
        && Number.isFinite(hourlyCostClp)
        && hourlyCostClp > 0
        && !latestHourlyCostByRole.has(role)) {
        latestHourlyCostByRole.set(role, hourlyCostClp);
      }
    }
    const planningHourlyCostClp = latestHourlyCostByRole.get('planning') || null;
    const executionHourlyCostClp = latestHourlyCostByRole.get('execution') || null;

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
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const createdLast30 = maintenanceRows.filter((row: any) => {
      const at = Date.parse(String(row.created_at || ''));
      return Number.isFinite(at) && at >= thirtyDaysAgoMs;
    }).length;
    const closedLast30 = maintenanceRows.filter((row: any) => {
      const at = Date.parse(String(row.closed_at || ''));
      return Number.isFinite(at) && at >= thirtyDaysAgoMs;
    }).length;
    const openSavedSecondsPerCase = createComparisonReady && createReductionPct != null && createReductionPct > 0
      ? Math.max(0, Math.round((manualOpen.medianMs! - maintenanceCreateMedianMs!) / 1000))
      : 0;
    const closeSavedSecondsPerCase = closeComparisonReady && closeReductionPct != null && closeReductionPct > 0
      ? Math.max(0, Math.round((manualClose.medianMs! - maintenanceCloseMedianMs!) / 1000))
      : 0;
    const openMonthlyValueClp = planningHourlyCostClp && openSavedSecondsPerCase > 0
      ? Math.round((openSavedSecondsPerCase * createdLast30 / 3600) * planningHourlyCostClp)
      : 0;
    const closeMonthlyValueClp = executionHourlyCostClp && closeSavedSecondsPerCase > 0
      ? Math.round((closeSavedSecondsPerCase * closedLast30 / 3600) * executionHourlyCostClp)
      : 0;
    const attributedMonthlyValueClp = openMonthlyValueClp + closeMonthlyValueClp;
    const v6Ready = attributedMonthlyValueClp > 0;
    const coveragePct = (count: number) => maintenanceRows.length > 0
      ? Math.round((count / maintenanceRows.length) * 100)
      : null;
    const workOrdersWithEvents = new Set(
      maintenanceEventRows.map((row: any) => String(row.work_order_id || '')).filter(Boolean),
    );
    const eventTypesByOrder = new Map<string, Set<string>>();
    for (const row of maintenanceEventRows) {
      const key = String(row.work_order_id || '');
      if (!key) continue;
      const types = eventTypesByOrder.get(key) || new Set<string>();
      types.add(String(row.event_type || ''));
      eventTypesByOrder.set(key, types);
    }
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
    const approvedReviewByOrder = new Map<string, string>();
    for (const row of maintenanceSupervisorReviews.data || []) {
      const key = String(row.work_order_id || '');
      const reviewedAt = String(row.reviewed_at || '');
      if (key && row.status === 'approved' && reviewedAt) approvedReviewByOrder.set(key, reviewedAt);
    }

    const traceCompleteClosedRows = closedRows.filter((row: any) => {
      const types = eventTypesByOrder.get(String(row.id)) || new Set<string>();
      return types.has('timer_play')
        && types.has('execution_evidence_added')
        && types.has('root_cause_changed')
        && types.has('preventive_actions_changed')
        && types.has('work_order_closed')
        && approvedReviewByOrder.has(String(row.id));
    });
    const traceCompleteCoveragePct = closedRows.length > 0
      ? Math.round((traceCompleteClosedRows.length / closedRows.length) * 100)
      : null;
    const coverageLevel = traceCompleteCoveragePct == null
      ? null
      : traceCompleteCoveragePct >= 95 ? 'C5'
        : traceCompleteCoveragePct >= 75 ? 'C4'
          : traceCompleteCoveragePct >= 50 ? 'C3'
            : traceCompleteCoveragePct >= 20 ? 'C2'
              : 'C1';

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
      evidenceLevel:
        hasObservedComparison ? 'E3' : timerRows.length >= 10 && maintenanceEventRows.length >= 50 ? 'E2' : timerRows.length > 0 ? 'E1' : 'E0',
      workflowLevel: timerRows.length > 0 && maintenanceEventRows.length > 0 ? 4 : maintenanceRows.length > 0 ? 2 : 0,
      lec: {
        level: timerRows.length > 0 && maintenanceEventRows.length > 0 ? 'L4' : maintenanceRows.length > 0 ? 'L2' : 'L1',
        evidence: hasObservedComparison ? 'E3' : timerRows.length >= 10 && maintenanceEventRows.length >= 50 ? 'E2' : timerRows.length > 0 ? 'E1' : 'E0',
        coverage: coverageLevel,
        valueLevel: v6Ready ? 'V6' : hasPositiveOperationalImpact ? 'V5' : timerRows.length >= 10 && maintenanceEventRows.length >= 50 ? 'V4' : maintenanceRows.length > 0 ? 'V2' : 'V0',
        coverageNumerator: traceCompleteClosedRows.length,
        coverageDenominator: closedRows.length,
        coveragePct: traceCompleteCoveragePct,
        coverageSemantics: 'closed OT with timer start, photo evidence, root cause, preventive action, close event and human supervisor approval',
      },
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
        closeSamples: maintenanceCloseTimingValues.length,
        medianCloseSeconds: maintenanceCloseMedianMs === null ? null : Math.round(maintenanceCloseMedianMs / 1000),
        semantics: 'active MOTIL administrative interactions only; opening and closure exclude mechanical execution and waiting',
      },
      impactGate: {
        open: {
          manualSamples: manualOpen.samples,
          assistedSamples: maintenanceCreateTimingValues.length,
          manualMedianSeconds: manualOpen.medianMs === null ? null : Math.round(manualOpen.medianMs / 1000),
          assistedMedianSeconds: maintenanceCreateMedianMs === null ? null : Math.round(maintenanceCreateMedianMs / 1000),
          comparisonReady: createComparisonReady,
          reductionPct: createReductionPct,
        },
        close: {
          manualSamples: manualClose.samples,
          assistedSamples: maintenanceCloseTimingValues.length,
          manualMedianSeconds: manualClose.medianMs === null ? null : Math.round(manualClose.medianMs / 1000),
          assistedMedianSeconds: maintenanceCloseMedianMs === null ? null : Math.round(maintenanceCloseMedianMs / 1000),
          comparisonReady: closeComparisonReady,
          reductionPct: closeReductionPct,
        },
        e3Ready: hasObservedComparison,
        v5Ready: hasPositiveOperationalImpact,
        v6Ready,
        semantics: 'E3 requires a comparable administrative cohort; V5 requires a positive observed time reduction; V6 additionally requires validated loaded hourly cost and current 30-day OT volume.',
      },
      economicValue: {
        planningHourlyCostClp,
        executionHourlyCostClp,
        createdLast30,
        closedLast30,
        openSavedSecondsPerCase,
        closeSavedSecondsPerCase,
        openMonthlyValueClp,
        closeMonthlyValueClp,
        attributedMonthlyValueClp: v6Ready ? attributedMonthlyValueClp : null,
        semantics: 'monthly attributable administrative capacity value based on positive observed time reduction, last-30-day OT volume and validated loaded hourly cost; not total maintenance ROI',
      },
      valueGate: {
        attribution: v6Ready ? 'VALOR_ECONOMICO_ATRIBUIBLE' : hasObservedComparison ? 'IMPACTO_OPERACIONAL_MEDIDO' : 'NO_MEDIBLE_AUN',
        pricingReadiness: v6Ready ? 'ECONOMIC_ANCHORED' : hasPositiveOperationalImpact ? 'OUTCOME_ANCHORED' : 'MARKET_ANCHORED',
        nextMeasurement: v6Ready
          ? 'Validar recurrencia por varios períodos antes de usarlo como ROI contractual.'
          : hasPositiveOperationalImpact
            ? 'Registrar costo/hora cargado validado por planificación y ejecución.'
          : hasObservedComparison
            ? 'La comparación ya es E3; mejorar el outcome antes de promover V5 o monetizar.'
            : 'Completar cohortes manuales y asistidas comparables de apertura/cierre.',
        semantics: 'coverage and workflow evidence are observed; savings, avoided downtime and ROI require a comparable baseline and attributable outcome',
      },
      semantics: 'observed maintenance execution and traceability; not saved time, avoided downtime, or economic ROI; execution cycle is first timer start to work-order closure',
    };

    return NextResponse.json({
      current: current.data || null,
      financeReview,
      financeReviewTiming,
      maintenanceValue,
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
        coverage: {
          C1: '<20% de OT cerradas con cadena completa',
          C2: '20–49% de OT cerradas con cadena completa',
          C3: '50–74% de OT cerradas con cadena completa',
          C4: '75–94% de OT cerradas con cadena completa',
          C5: '≥95% de OT cerradas con cadena completa',
        },
        valueLevel: {
          V0: 'Habilitador técnico',
          V1: 'Visibilidad',
          V2: 'Control',
          V3: 'Priorización',
          V4: 'Decisión asistida',
          V5: 'Resultado operacional',
          V6: 'Resultado económico atribuible',
          V7: 'Valor estratégico demostrado',
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
