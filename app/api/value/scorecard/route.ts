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
    const [current, history, financeReviews, financeTiming, maintenanceWorkOrders, maintenanceEvents, maintenanceSupplyChain, maintenancePlanningEvidence, maintenanceProcurementIntakes, maintenanceProcurementOrders, maintenanceProcurementReceipts, maintenanceParts, maintenancePlanApplications, maintenanceStandardPlans] = await Promise.all([
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
        .select('id,canonical_asset_id,status,total_timer_seconds,actual_duration_hours,scheduled_date,closed_at,created_at')
        .eq('organization_id', context.organizationId)
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
        .select('action,resource_identifier,new_values,created_at,user_id')
        .eq('organization_id', context.organizationId)
        .in('action', ['maintenance_weekly_planning_session_started','maintenance_weekly_planning_decision_opened','maintenance_standard_plan_decision','maintenance_standard_plan_edited'])
        .order('created_at', { ascending: false })
        .limit(2000),
            context.supabase
        .from('procurement_intake_requests')
        .select('id,work_order_id,created_at,status')
        .eq('organization_id', context.organizationId)
        .not('work_order_id', 'is', null)
        .limit(5000),
      context.supabase
        .from('procurement_operational_orders')
        .select('id,work_order_id,issued_at,status')
        .eq('organization_id', context.organizationId)
        .not('work_order_id', 'is', null)
        .limit(5000),
      context.supabase
        .from('procurement_operational_receipts')
        .select('id,order_id,received_at')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('work_order_parts')
        .select('id,work_order_id,installed_at,quantity_installed,status')
        .eq('organization_id', context.organizationId)
        .limit(10000),
      context.supabase
        .from('maintenance_standard_job_plan_applications')
        .select('id,plan_id,work_order_id,status,applied_at')
        .eq('organization_id', context.organizationId)
        .not('work_order_id', 'is', null)
        .limit(5000),
      context.supabase
        .from('maintenance_standard_job_plans')
        .select('id,estimated_duration_hours')
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
    if (maintenancePlanningEvidence.error) throw maintenancePlanningEvidence.error;
    if (maintenanceProcurementIntakes.error) throw maintenanceProcurementIntakes.error;
    if (maintenanceProcurementOrders.error) throw maintenanceProcurementOrders.error;
    if (maintenanceProcurementReceipts.error) throw maintenanceProcurementReceipts.error;
    if (maintenanceParts.error) throw maintenanceParts.error;
    if (maintenancePlanApplications.error) throw maintenancePlanApplications.error;
    if (maintenanceStandardPlans.error) throw maintenanceStandardPlans.error;

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
    const closedWorkOrderIds = new Set(closedRows.map((row: any) => String(row.id || '')).filter(Boolean));
    const supplyChainFunnel = {
      workOrdersObserved: supplyRows.length,
      withRequirements: supplyRows.filter((row: any) => Number(row.material_requirement_count || 0) > 0).length,
      withShortage: supplyRows.filter((row: any) => Number(row.material_shortage_count || 0) > 0).length,
      withRequest: supplyRows.filter((row: any) => Number(row.procurement_request_count || 0) > 0).length,
      withOrder: supplyRows.filter((row: any) => Number(row.procurement_order_count || 0) > 0).length,
      withDeliveredOrder: supplyRows.filter((row: any) => Number(row.delivered_order_count || 0) > 0).length,
      withInstalledParts: supplyRows.filter((row: any) => Number(row.parts_installed || 0) > 0).length,
      closedWithOpenShortage: supplyRows.filter(
        (row: any) => closedWorkOrderIds.has(String(row.work_order_id || '')) && Number(row.material_shortage_count || 0) > 0,
      ).length,
      semantics: 'cross-domain maintenance supply funnel; historical closed shortages are data-quality debt, not active compliance',
    };

    const connectedDomains = [
      maintenanceRows.length > 0 ? 'Mantención' : null,
      withMaterials > 0 || withPartsInstalled > 0 ? 'Bodega' : null,
      withProcurementRequests > 0 || withPurchaseOrders > 0 ? 'Compras' : null,
      procurementCommitment > 0 ? 'Finanzas' : null,
    ].filter(Boolean);

    const eventTimes = new Map<string, { created?: string; start?: string; close?: string }>();
    for (const row of maintenanceEventRows) {
      const key = String(row.work_order_id || '');
      if (!key) continue;
      const current = eventTimes.get(key) || {};
      const at = String(row.event_at || '');
      if (row.event_type === 'work_order_created' && (!current.created || at < current.created)) current.created = at;
      if (row.event_type === 'timer_play' && (!current.start || at < current.start)) current.start = at;
      if (row.event_type === 'work_order_closed' && (!current.close || at > current.close)) current.close = at;
      eventTimes.set(key, current);
    }
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

    const intakeRows = maintenanceProcurementIntakes.data || [];
    const orderRows = maintenanceProcurementOrders.data || [];
    const receiptRows = maintenanceProcurementReceipts.data || [];
    const partRows = maintenanceParts.data || [];

    const orderById = new Map(orderRows.map((row: any) => [String(row.id), row]));
    const firstIntakeByWorkOrder = new Map<string, number>();
    const firstOrderByWorkOrder = new Map<string, number>();
    const firstReceiptByWorkOrder = new Map<string, number>();
    const firstInstallByWorkOrder = new Map<string, number>();

    for (const row of intakeRows) {
      const workOrderId = String((row as any).work_order_id || '');
      const at = Date.parse(String((row as any).created_at || ''));
      if (!workOrderId || !Number.isFinite(at)) continue;
      const current = firstIntakeByWorkOrder.get(workOrderId);
      if (current == null || at < current) firstIntakeByWorkOrder.set(workOrderId, at);
    }
    for (const row of orderRows) {
      const workOrderId = String((row as any).work_order_id || '');
      const at = Date.parse(String((row as any).issued_at || ''));
      if (!workOrderId || !Number.isFinite(at)) continue;
      const current = firstOrderByWorkOrder.get(workOrderId);
      if (current == null || at < current) firstOrderByWorkOrder.set(workOrderId, at);
    }
    for (const row of receiptRows) {
      const order = orderById.get(String((row as any).order_id || ''));
      const workOrderId = String(order?.work_order_id || '');
      const at = Date.parse(String((row as any).received_at || ''));
      if (!workOrderId || !Number.isFinite(at)) continue;
      const current = firstReceiptByWorkOrder.get(workOrderId);
      if (current == null || at < current) firstReceiptByWorkOrder.set(workOrderId, at);
    }
    for (const row of partRows) {
      const workOrderId = String((row as any).work_order_id || '');
      const at = Date.parse(String((row as any).installed_at || ''));
      if (!workOrderId || !Number.isFinite(at) || Number((row as any).quantity_installed || 0) <= 0) continue;
      const current = firstInstallByWorkOrder.get(workOrderId);
      if (current == null || at < current) firstInstallByWorkOrder.set(workOrderId, at);
    }

    const stageSeconds = (from: Map<string, number>, to: Map<string, number>) =>
      Array.from(from.entries())
        .map(([workOrderId, fromAt]) => {
          const toAt = to.get(workOrderId);
          return toAt != null && toAt >= fromAt ? Math.round((toAt - fromAt) / 1000) : null;
        })
        .filter((value): value is number => value !== null)
        .sort((a, b) => a - b);

    const median = (values: number[]) => {
      if (!values.length) return null;
      const midpoint = Math.floor(values.length / 2);
      return values.length % 2 === 0 ? Math.round((values[midpoint - 1] + values[midpoint]) / 2) : values[midpoint];
    };

    const intakeToOrderSeconds = stageSeconds(firstIntakeByWorkOrder, firstOrderByWorkOrder);
    const orderToReceiptSeconds = stageSeconds(firstOrderByWorkOrder, firstReceiptByWorkOrder);
    const receiptToInstallSeconds = stageSeconds(firstReceiptByWorkOrder, firstInstallByWorkOrder);

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

    const planningEvidenceRows = maintenancePlanningEvidence.data || [];
    const planningSessions = planningEvidenceRows.filter((row: any) => row.action === 'maintenance_weekly_planning_session_started');
    const planningDecisions = planningEvidenceRows.filter((row: any) => row.action === 'maintenance_weekly_planning_decision_opened');
    const planningLatencyMs = planningDecisions
      .map((row: any) => Number(row.new_values?.decision_latency_ms))
      .filter((value: number) => Number.isFinite(value) && value >= 0 && value <= 30 * 60 * 1000)
      .sort((a: number, b: number) => a - b);
    const planningLatencyMidpoint = Math.floor(planningLatencyMs.length / 2);
    const planningMedianLatencyMs =
      planningLatencyMs.length === 0
        ? null
        : planningLatencyMs.length % 2 === 0
          ? Math.round((planningLatencyMs[planningLatencyMidpoint - 1] + planningLatencyMs[planningLatencyMidpoint]) / 2)
          : planningLatencyMs[planningLatencyMidpoint];
    const planningActionCounts = planningDecisions.reduce((acc: Record<string, number>, row: any) => {
      const action = String(row.new_values?.decision_action || 'unknown');
      acc[action] = (acc[action] || 0) + 1;
      return acc;
    }, {});
    const planningUniqueAssetDecisions = new Set(
      planningDecisions
        .map((row: any) => String(row.new_values?.asset_id || row.resource_identifier || ''))
        .filter(Boolean),
    ).size;
    const planningPreparedDecisions = planningSessions.reduce(
      (sum: number, row: any) => sum + Math.max(0, Number(row.new_values?.decisions_prepared) || 0),
      0,
    );

    const standardPlanEditRows = planningEvidenceRows.filter(
      (row: any) => row.action === 'maintenance_standard_plan_edited',
    );
    const motilEditedPlanIds = new Set(
      standardPlanEditRows
        .filter((row: any) => row.new_values?.proposal_source === 'motil')
        .map((row: any) => String(row.resource_identifier || ''))
        .filter(Boolean),
    );
    const standardPlanDecisionRows = planningEvidenceRows.filter(
      (row: any) => row.action === 'maintenance_standard_plan_decision',
    );
    const motilStandardPlanDecisions = standardPlanDecisionRows.filter(
      (row: any) => row.new_values?.proposal_source === 'motil',
    );
    const decidedMotilPlanIds = new Set(
      motilStandardPlanDecisions
        .map((row: any) => String(row.resource_identifier || ''))
        .filter(Boolean),
    );
    const correctedDecidedMotilPlanIds = new Set(
      Array.from(motilEditedPlanIds).filter((planId) => decidedMotilPlanIds.has(planId)),
    );
    const standardPlanDecisionCycles = motilStandardPlanDecisions
      .map((row: any) => Number(row.new_values?.decision_cycle_seconds))
      .filter((value: number) => Number.isFinite(value) && value >= 0)
      .sort((a: number, b: number) => a - b);
    const standardPlanCycleMidpoint = Math.floor(standardPlanDecisionCycles.length / 2);
    const medianStandardPlanDecisionSeconds =
      standardPlanDecisionCycles.length === 0
        ? null
        : standardPlanDecisionCycles.length % 2 === 0
          ? Math.round((standardPlanDecisionCycles[standardPlanCycleMidpoint - 1] + standardPlanDecisionCycles[standardPlanCycleMidpoint]) / 2)
          : standardPlanDecisionCycles[standardPlanCycleMidpoint];

    const maintenanceValue = {
      workOrders: maintenanceRows.length,
      closedWorkOrders: closedRows.length,
      timerInstrumentedWorkOrders: timerRows.length,
      timerCoverage:
        maintenanceRows.length > 0
          ? Math.round((timerRows.length / maintenanceRows.length) * 100)
          : null,
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
      crossDomainCycle: {
        intakeToOrder: {
          samples: intakeToOrderSeconds.length,
          medianSeconds: median(intakeToOrderSeconds),
        },
        orderToReceipt: {
          samples: orderToReceiptSeconds.length,
          medianSeconds: median(orderToReceiptSeconds),
        },
        receiptToInstall: {
          samples: receiptToInstallSeconds.length,
          medianSeconds: median(receiptToInstallSeconds),
        },
        semantics: 'observed stage timing across maintenance and procurement using canonical timestamps; empty stages are not estimated',
      },
      medianExecutionCycleHours:
        medianExecutionCycleSeconds === null
          ? null
          : Math.round((medianExecutionCycleSeconds / 3600) * 100) / 100,
      evidenceLevel:
        timerRows.length >= 10 && maintenanceEventRows.length >= 50 ? 'E2' : timerRows.length > 0 ? 'E1' : 'E0',
      workflowLevel: timerRows.length > 0 && maintenanceEventRows.length > 0 ? 4 : maintenanceRows.length > 0 ? 2 : 0,
      connectedDomains,
      connectedDomainCount: connectedDomains.length,
      weeklyPlanning: {
        sessions: planningSessions.length,
        decisionsOpened: planningDecisions.length,
        uniqueAssetsEngaged: planningUniqueAssetDecisions,
        preparedDecisionCount: planningPreparedDecisions,
        medianDecisionLatencySeconds: planningMedianLatencyMs === null ? null : Math.round(planningMedianLatencyMs / 1000),
        actions: planningActionCounts,
        latestAt: planningEvidenceRows[0]?.created_at || null,
        evidenceLevel: planningDecisions.length >= 20 ? 'E2' : planningDecisions.length > 0 ? 'E1' : 'E0',
        semantics: 'human engagement with weekly decisions prepared by MOTIL; not acceptance, saved time, or economic impact',
      },
      standardPlanLearning: {
        motilDecisions: motilStandardPlanDecisions.length,
        approved: motilStandardPlanDecisions.filter((row: any) => row.new_values?.status === 'approved').length,
        rejected: motilStandardPlanDecisions.filter((row: any) => row.new_values?.status === 'rejected').length,
        editedPlans: motilEditedPlanIds.size,
        correctedDecidedPlans: correctedDecidedMotilPlanIds.size,
        editEvents: standardPlanEditRows.filter((row: any) => row.new_values?.proposal_source === 'motil').length,
        acceptanceRatePct:
          motilStandardPlanDecisions.length > 0
            ? Math.round(
                (motilStandardPlanDecisions.filter((row: any) => row.new_values?.status === 'approved').length /
                  motilStandardPlanDecisions.length) *
                  100,
              )
            : null,
        correctionRatePct:
          motilStandardPlanDecisions.length > 0
            ? Math.round((correctedDecidedMotilPlanIds.size / motilStandardPlanDecisions.length) * 100)
            : null,
        medianDecisionCycleSeconds: medianStandardPlanDecisionSeconds,
        evidenceLevel: motilStandardPlanDecisions.length >= 20 ? 'E2' : motilStandardPlanDecisions.length > 0 ? 'E1' : 'E0',
        semantics: 'human outcome and correction evidence on MOTIL-generated standard plan proposals; acceptance and correction are calibration evidence, not economic impact',
      },
      supplyChain: {
        workOrders: supplyRows.length,
        withMaterials,
        withShortages,
        withProcurementRequests,
        withPurchaseOrders,
        withPartsInstalled,
        procurementCommitment,
        tracedPartsCost,
        funnel: supplyChainFunnel,
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
