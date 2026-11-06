export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

type WorkOrder = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  work_type: string | null;
  canonical_asset_id: string | null;
  assigned_person_id: string | null;
  assigned_to_name: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  closed_at: string | null;
  completion_date: string | null;
};

type Readiness = {
  work_order_id: string;
  open_procurement_orders: number | string | null;
  pending_parts: number | string | null;
  unmet_material_requirements: number | string | null;
  pending_external_services: number | string | null;
  open_labor_entries: number | string | null;
  external_cost_conflict: boolean | null;
  standard_plan_steps_pending: number | string | null;
  ready_to_close: boolean | null;
  next_action: string | null;
};

type Review = {
  work_order_id: string;
  status: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
};

type Asset = { id: string; asset_code: string | null; name: string | null };

const phaseOrder = ['backlog','planning','prepared','execution','closeout','approval','history'] as const;
type Phase = typeof phaseOrder[number];

function hasExecutionBlocker(row?: Readiness | null) {
  if (!row) return false;
  return Number(row.open_procurement_orders || 0) > 0
    || Number(row.unmet_material_requirements || 0) > 0
    || Number(row.pending_external_services || 0) > 0;
}

function hasCloseoutPending(row?: Readiness | null) {
  if (!row) return false;
  return Number(row.pending_parts || 0) > 0
    || Number(row.open_labor_entries || 0) > 0
    || Boolean(row.external_cost_conflict)
    || Number(row.standard_plan_steps_pending || 0) > 0;
}

function derivePhase(order: WorkOrder, readiness?: Readiness | null, review?: Review | null): Phase {
  const status = String(order.status || '').toLowerCase();
  if (status === 'completed' || status === 'closed') {
    return review?.status === 'approved' ? 'history' : 'approval';
  }
  if (status === 'in_progress') return 'execution';
  if (readiness?.ready_to_close || ['record_root_cause','record_preventive_actions','record_actual_hours','record_runtime_evidence','record_fluid_closure','close_work_order'].includes(String(readiness?.next_action || ''))) {
    return 'closeout';
  }
  if (!order.canonical_asset_id || !order.assigned_person_id) return 'backlog';
  if (hasExecutionBlocker(readiness)) return 'planning';
  if (order.scheduled_date) return 'prepared';
  return 'planning';
}

function nextAction(phase: Phase, order: WorkOrder, readiness?: Readiness | null) {
  if (phase === 'backlog') {
    if (!order.canonical_asset_id) return 'Vincular activo';
    if (!order.assigned_person_id) return 'Asignar responsable';
    return 'Completar screening';
  }
  if (phase === 'planning') {
    if (hasExecutionBlocker(readiness)) return 'Resolver materiales/servicios';
    return order.scheduled_date ? 'Preparar ejecución' : 'Programar fecha';
  }
  if (phase === 'prepared') return 'Liberar a ejecución';
  if (phase === 'execution') return 'Ejecutar y registrar evidencia';
  if (phase === 'closeout') return 'Completar cierre técnico';
  if (phase === 'approval') return 'Ariel revisa y aprueba';
  return 'Historial trazable';
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    if (accessLevel === 'SR') return NextResponse.json({ error: 'Sin acceso a Mantenimiento.' }, { status: 403 });

    const { data: orders, error: orderError } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,work_order_number,title,status,priority,work_type,canonical_asset_id,assigned_person_id,assigned_to_name,scheduled_date,created_at,closed_at,completion_date')
      .eq('organization_id', context.organizationId)
      .not('status', 'in', '("cancelled","canceled")')
      .order('created_at', { ascending: false })
      .limit(250);
    if (orderError) throw orderError;

    const orderRows = (orders || []) as WorkOrder[];
    const ids = orderRows.map((row) => row.id);

    const [readinessResult, reviewResult] = ids.length
      ? await Promise.all([
          context.supabase
            .from('work_order_close_readiness_v2')
            .select('work_order_id,open_procurement_orders,pending_parts,unmet_material_requirements,pending_external_services,open_labor_entries,external_cost_conflict,standard_plan_steps_pending,ready_to_close,next_action')
            .eq('organization_id', context.organizationId)
            .in('work_order_id', ids.slice(0, 250)),
          context.supabase
            .from('work_order_supervisor_reviews')
            .select('work_order_id,status,reviewed_at,reviewed_by_name')
            .eq('organization_id', context.organizationId)
            .in('work_order_id', ids.slice(0, 250)),
        ])
      : [{ data: [], error: null }, { data: [], error: null }];
    if (readinessResult.error) throw readinessResult.error;
    if (reviewResult.error) throw reviewResult.error;

    const readinessMap = new Map((readinessResult.data || []).map((row: any) => [String(row.work_order_id), row as Readiness]));
    const reviewMap = new Map((reviewResult.data || []).map((row: any) => [String(row.work_order_id), row as Review]));

    const assetIds = Array.from(new Set(orderRows.map((row) => row.canonical_asset_id).filter((id): id is string => Boolean(id))));
    const assetMap = new Map<string, Asset>();
    if (assetIds.length) {
      const { data: assets, error: assetError } = await context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name')
        .eq('organization_id', context.organizationId)
        .in('id', assetIds.slice(0, 250));
      if (assetError) throw assetError;
      for (const asset of (assets || []) as Asset[]) assetMap.set(asset.id, asset);
    }

    const rows = orderRows.map((order) => {
      const readiness = readinessMap.get(order.id) || null;
      const review = reviewMap.get(order.id) || null;
      const phase = derivePhase(order, readiness, review);
      return {
        id: order.id,
        workOrderNumber: order.work_order_number,
        title: order.title,
        status: order.status,
        priority: order.priority,
        workType: order.work_type,
        scheduledDate: order.scheduled_date,
        assignedToName: order.assigned_to_name,
        phase,
        nextAction: nextAction(phase, order, readiness),
        blockers: {
          procurement: Number(readiness?.open_procurement_orders || 0),
          parts: Number(readiness?.pending_parts || 0),
          materials: Number(readiness?.unmet_material_requirements || 0),
          externalServices: Number(readiness?.pending_external_services || 0),
          labor: Number(readiness?.open_labor_entries || 0),
          costConflict: Boolean(readiness?.external_cost_conflict),
        },
        pendingPlanSteps: Number(readiness?.standard_plan_steps_pending || 0),
        asset: order.canonical_asset_id ? assetMap.get(order.canonical_asset_id) || null : null,
        review: review || null,
        href: phase === 'closeout'
          ? `/dashboard/mantenimiento/ordenes-trabajo/cierre?workOrderId=${encodeURIComponent(order.id)}`
          : `/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(order.id)}`,
      };
    });

    const phases = phaseOrder.map((phase) => {
      const phaseRows = rows.filter((row) => row.phase === phase);
      return {
        phase,
        count: phaseRows.length,
        urgent: phaseRows.filter((row) => ['critical','high','p1','p2'].includes(String(row.priority || '').toLowerCase())).length,
        rows: phaseRows.slice(0, 5),
      };
    });

    const openRows = rows.filter((row) => !['approval','history'].includes(row.phase));
    const blockedRows = openRows.filter((row) => {
      const readiness = readinessMap.get(row.id) || null;
      return hasExecutionBlocker(readiness);
    });
    const closeoutPendingRows = openRows.filter((row) => {
      const readiness = readinessMap.get(row.id) || null;
      return hasCloseoutPending(readiness);
    });
    const assignedRows = openRows.filter((row) => Boolean(row.assignedToName));
    const scheduledRows = openRows.filter((row) => Boolean(row.scheduledDate));
    const approvedRows = rows.filter((row) => row.phase === 'history');

    return NextResponse.json({
      phases,
      summary: {
        workOrders: rows.length,
        open: openRows.length,
        blocked: blockedRows.length,
        closeoutPending: closeoutPendingRows.length,
        assigned: assignedRows.length,
        scheduled: scheduledRows.length,
        pendingApproval: rows.filter((row) => row.phase === 'approval').length,
        approved: approvedRows.length,
        assignmentCoveragePct: openRows.length ? Math.round((assignedRows.length / openRows.length) * 100) : null,
        schedulingCoveragePct: openRows.length ? Math.round((scheduledRows.length / openRows.length) * 100) : null,
      },
      semantics: {
        model: 'MOTIL EAM phase model derived from canonical OT state; no parallel maintenance master is created.',
        executionGate: 'Blocked counts only conditions that prevent starting execution: open procurement, unmet material requirements, or pending external services. Labor, installed/pending parts, plan steps, and cost conflicts remain closeout evidence and do not masquerade as start blockers.',
        approval: 'Ariel approval remains post-execution under the current La Patagua contract.',
        sapReference: 'SAP-style discipline: technical object + planning + preparation + execution + post-execution + completion, adapted to MOTIL authority rules.',
      },
      source: ['maintenance_work_orders','work_order_close_readiness_v2','work_order_supervisor_reviews','maintenance_canonical_assets_v1'],
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar el modelo EAM de Mantenimiento.' },
      { status: 500 },
    );
  }
}
