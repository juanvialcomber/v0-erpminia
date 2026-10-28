export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { resolveWorkshopHeadScope, workshopHeadOrderFilter } from '@/lib/maintenance/workshop-site-scope';

type CloseQueueRow = {
  organization_id: string;
  work_order_id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  work_type: string | null;
  canonical_asset_id: string | null;
  cost_center_id: string | null;
  root_cause: string | null;
  preventive_actions: string | null;
  actual_duration_hours: number | string | null;
  total_cost: number | string | null;
  runtime_evidence_status: string | null;
  runtime_reading_id: string | null;
  runtime_unavailable_reason: string | null;
  hour_schedule_linked: boolean;
  missing_runtime_evidence: boolean;
  standard_plan_steps_total: number | string | null;
  standard_plan_steps_completed: number | string | null;
  standard_plan_steps_pending: number | string | null;
  next_plan_step_id: string | null;
  next_plan_step_sequence: number | null;
  next_plan_step_title: string | null;
  next_plan_step_instructions: string | null;
  next_plan_step_control_requirement: string | null;
  next_plan_step_document_reference: string | null;
  missing_root_cause: boolean;
  missing_preventive_actions: boolean;
  missing_actual_hours: boolean;
  ready_to_close: boolean;
  next_action: string;
};

type AssetRow = { id: string; asset_code: string | null; name: string | null };

const actionRank: Record<string, number> = {
  resolve_asset: 0,
  resolve_procurement: 1,
  resolve_parts: 2,
  resolve_materials: 3,
  resolve_external_services: 4,
  resolve_labor: 5,
  reconcile_external_cost: 6,
  complete_standard_plan_step: 7,
  record_root_cause: 8,
  record_preventive_actions: 9,
  record_actual_hours: 10,
  record_runtime_evidence: 11,
  close_work_order: 12,
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    let allowedWorkOrderIds: string[] | null = null;
    let canEditAssigned = false;
    const workshopScope = await resolveWorkshopHeadScope(context);

    if (workshopScope.isWorkshopHead) {
      // An ED grant is not permission to see other mines' queues.
      if (workshopScope.personId) {
        const { data: siteOrders, error: siteError } = await context.supabase
          .from('maintenance_work_orders')
          .select('id')
          .eq('organization_id', context.organizationId)
          .or(workshopHeadOrderFilter(workshopScope))
          .not('status', 'in', '("completed","closed","cancelled","canceled")');
        if (siteError) throw siteError;
        allowedWorkOrderIds = (siteOrders || []).map((row) => row.id);
        canEditAssigned = true;
      } else {
        allowedWorkOrderIds = [];
      }
    } else if (accessLevel !== 'ED') {
      const { data: person, error: personError } = await context.supabase
        .from('people')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('profile_id', context.userId)
        .eq('employment_status', 'active')
        .maybeSingle();
      if (personError) throw personError;

      if (person) {
        const { data: assignedOrders, error: assignedError } = await context.supabase
          .from('maintenance_work_orders')
          .select('id')
          .eq('organization_id', context.organizationId)
          .eq('assigned_person_id', person.id)
          .not('status', 'in', '("completed","closed","cancelled","canceled")');
        if (assignedError) throw assignedError;
        allowedWorkOrderIds = (assignedOrders || []).map((row) => row.id);
        canEditAssigned = allowedWorkOrderIds.length > 0;
      }

      if (accessLevel === 'SR' && !canEditAssigned) {
        return NextResponse.json({
          queue: [],
          summary: {
            openOrders: 0,
            readyToClose: 0,
            blocked: 0,
            pendingPlanSteps: 0,
            workOrdersWithPendingPlan: 0,
            missingRootCause: 0,
            missingPreventiveActions: 0,
            missingActualHours: 0,
            missingRuntimeEvidence: 0,
          },
          canEdit: false,
          source: 'work_order_close_readiness_v2',
        });
      }
    }

    if (allowedWorkOrderIds !== null && allowedWorkOrderIds.length === 0) {
      return NextResponse.json({
        queue: [],
        summary: {
          openOrders: 0, readyToClose: 0, blocked: 0, pendingPlanSteps: 0,
          workOrdersWithPendingPlan: 0, missingRootCause: 0,
          missingPreventiveActions: 0, missingActualHours: 0, missingRuntimeEvidence: 0,
        },
        canEdit: canEditAssigned, source: 'work_order_close_readiness_v2',
        workshopSite: workshopScope.isWorkshopHead ? workshopScope.site : null,
      });
    }

    const requestedWorkOrderId = String(request.nextUrl.searchParams.get('workOrderId') || '').trim();

    let readinessQuery = context.supabase
      .from('work_order_close_readiness_v2')
      .select('*')
      .eq('organization_id', context.organizationId);
    if (allowedWorkOrderIds) readinessQuery = readinessQuery.in('work_order_id', allowedWorkOrderIds);
    if (requestedWorkOrderId) readinessQuery = readinessQuery.eq('work_order_id', requestedWorkOrderId);

    const { data, error } = await readinessQuery;
    if (error) throw error;

    const rows = (data || []) as CloseQueueRow[];
    const assetIds = [...new Set(rows.map((row) => row.canonical_asset_id).filter((id): id is string => Boolean(id)))];
    const assetMap = new Map<string, AssetRow>();
    if (assetIds.length > 0) {
      const { data: assets, error: assetError } = await context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name')
        .eq('organization_id', context.organizationId)
        .in('id', assetIds);
      if (assetError) throw assetError;
      for (const asset of (assets || []) as AssetRow[]) assetMap.set(asset.id, asset);
    }

    const queue = rows
      .map((row) => ({ ...row, asset: row.canonical_asset_id ? assetMap.get(row.canonical_asset_id) || null : null }))
      .sort((a, b) => {
        const actionDiff = (actionRank[a.next_action] ?? 99) - (actionRank[b.next_action] ?? 99);
        if (actionDiff !== 0) return actionDiff;
        return String(a.work_order_number || '').localeCompare(String(b.work_order_number || ''), 'es');
      });

    const summary = {
      openOrders: queue.length,
      readyToClose: queue.filter((row) => row.ready_to_close).length,
      blocked: queue.filter((row) => !row.ready_to_close).length,
      pendingPlanSteps: queue.reduce((sum, row) => sum + Number(row.standard_plan_steps_pending || 0), 0),
      workOrdersWithPendingPlan: queue.filter((row) => Number(row.standard_plan_steps_pending || 0) > 0).length,
      missingRootCause: queue.filter((row) => row.missing_root_cause).length,
      missingPreventiveActions: queue.filter((row) => row.missing_preventive_actions).length,
      missingActualHours: queue.filter((row) => row.missing_actual_hours).length,
      missingRuntimeEvidence: queue.filter((row) => row.missing_runtime_evidence).length,
    };

    return NextResponse.json({
      queue,
      summary,
      canEdit: accessLevel === 'ED' || canEditAssigned,
      source: 'work_order_close_readiness_v2',
      requestedWorkOrderId: requestedWorkOrderId || null,
      workshopSite: workshopScope.isWorkshopHead ? workshopScope.site : null,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la cola de cierre de OT';
    return NextResponse.json({ queue: [], error: message }, { status: 500 });
  }
}
