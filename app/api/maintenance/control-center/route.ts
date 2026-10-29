export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type ActionItem = {
  id: string;
  kind: string;
  priority: number;
  title: string;
  description: string;
  evidence: string;
  href: string;
  assetHref?: string | null;
};

type AutopilotPreparation = {
  state: 'prepared';
  risk: 'low' | 'medium' | 'high';
  requiresHumanDecision: true;
  preparedAction: string;
  authority: string;
};

const autopilotPreparation = (action: ActionItem): AutopilotPreparation => {
  const byKind: Record<string, Omit<AutopilotPreparation, 'state' | 'requiresHumanDecision'>> = {
    operational_review: { risk: 'high', preparedAction: 'Abrir OT correctiva preconfigurada desde la evidencia operacional', authority: 'Supervisor valida la señal y decide si crea la OT' },
    preventive_overdue: { risk: 'medium', preparedAction: 'Abrir la intervención preventiva con activo y vencimiento ya contextualizados', authority: 'Planificador confirma ventana, alcance y recursos' },
    assignment_needed: { risk: 'medium', preparedAction: 'Abrir la OT pendiente de responsable', authority: 'Planificador asigna la persona responsable' },
    meter_review: { risk: 'high', preparedAction: 'Abrir la evidencia de horómetro contradictoria', authority: 'Persona autorizada valida la lectura canónica' },
    operational_blocker: { risk: 'high', preparedAction: 'Abrir el bloqueo exacto que impide continuar o cerrar', authority: 'Responsable operativo resuelve el bloqueo en su flujo canónico' },
    supply_integrity: { risk: 'high', preparedAction: 'Abrir la OT cerrada con abastecimiento todavía pendiente', authority: 'Mantención y Bodega validan si el faltante fue resuelto fuera del flujo o requiere regularización' },
    plan_step: { risk: 'medium', preparedAction: 'Abrir el siguiente paso pendiente del plan estándar', authority: 'Ejecutor autorizado registra la ejecución real' },
    ready_to_close: { risk: 'high', preparedAction: 'Abrir la OT con controles de cierre satisfechos', authority: 'Responsable autorizado revisa y ejecuta el cierre' },
    closure_evidence: { risk: 'medium', preparedAction: 'Abrir la evidencia faltante para cierre auditado', authority: 'Responsable completa o valida la evidencia requerida' },
    reliability: { risk: 'medium', preparedAction: 'Abrir la recurrencia validada para revisión', authority: 'Supervisor o confiabilidad decide la acción posterior' },
  };
  const prepared = byKind[action.kind] || { risk: 'medium' as const, preparedAction: 'Abrir el contexto operacional asociado', authority: 'Una persona autorizada toma la decisión' };
  return { state: 'prepared', requiresHumanDecision: true, ...prepared };
};

const assetHref = (assetId: unknown) => assetId ? `/dashboard/mantenimiento/equipos/${encodeURIComponent(String(assetId))}/ficha` : null;

const isOutOfServiceReview = (row: any) => {
  const reason = String(row.review_reason || '').toLowerCase();
  const status = String(row.equipment_status_raw || '').toLowerCase();
  return reason === 'out_of_service' || status.includes('fuera de servicio');
};

const preventiveGroupKey = (row: any) => [
  row.canonical_asset_id || row.asset_code || row.asset_name || 'unknown-asset',
  row.due_meter ?? 'unknown-due',
  row.frequency_hours ?? 'unknown-frequency',
].map(String).join('|');

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [closeResult, preventiveResult, reliabilityResult, operationalOrdersResult, drillingReviewResult, completedOrdersResult, supervisorReviewsResult, meterReviewResult, completedSupplyResult] = await Promise.all([
      context.supabase.from('work_order_close_readiness_v2').select('*').eq('organization_id', context.organizationId),
      context.supabase.from('preventive_maintenance_hour_status_v1').select('*').eq('organization_id', context.organizationId),
      context.supabase.from('maintenance_reliability_by_asset_v1').select('canonical_asset_id,asset_code,asset_name,audited_closures,recurring_cause_count,max_same_cause_occurrences,has_recurring_root_cause').eq('organization_id', context.organizationId),
      context.supabase.from('maintenance_work_orders').select('id,work_order_number,title,canonical_asset_id,assigned_person_id').eq('organization_id', context.organizationId).not('created_by', 'is', null).neq('status', 'completed'),
      context.supabase.from('drilling_maintenance_review_queue_v1').select('review_id,canonical_asset_id,asset_code,asset_name,operation_date,review_reason,equipment_status_raw,machine_observations,review_status,linked_work_order_id,has_linked_work_order').eq('organization_id', context.organizationId).eq('review_status', 'pending').eq('has_linked_work_order', false).order('operation_date', { ascending: true }).limit(50),
      context.supabase.from('maintenance_work_orders').select('id,work_order_number,title,canonical_asset_id,completion_date,assigned_to_name').eq('organization_id', context.organizationId).not('created_by', 'is', null).eq('status', 'completed').order('completion_date', { ascending: false, nullsFirst: false }).limit(100),
      context.supabase.from('work_order_supervisor_reviews').select('work_order_id,status').eq('organization_id', context.organizationId),
      context.supabase.from('maintenance_meter_review_queue').select('id,canonical_asset_id,submitted_hours,previous_hours,attempted_at,reason').eq('organization_id', context.organizationId).eq('status', 'pending').order('attempted_at', { ascending: false }).limit(100),
      context.supabase.from('work_order_supply_chain_v1').select('work_order_id,work_order_number,title,canonical_asset_id,work_order_status,priority,scheduled_date,material_shortage_count,material_shortage_quantity,open_supply_need_count,supply_needs_with_request,open_procurement_request_count,procurement_order_count,undelivered_order_count,procurement_order_amount,supply_chain_status').eq('organization_id', context.organizationId).eq('work_order_status', 'completed').limit(200),
    ]);
    const error = closeResult.error || preventiveResult.error || reliabilityResult.error || operationalOrdersResult.error || drillingReviewResult.error || completedOrdersResult.error || supervisorReviewsResult.error || meterReviewResult.error || completedSupplyResult.error;
    if (error) throw error;

    const operationalOrderRows = operationalOrdersResult.data || [];
    const operationalWorkOrderIds = new Set(operationalOrderRows.map((row:any) => String(row.id)));
    const unassignedOperationalOrders = operationalOrderRows.filter((row:any) => !row.assigned_person_id);
    const allCloseRows = closeResult.data || [];
    const closeRows = allCloseRows.filter((row:any) => operationalWorkOrderIds.has(String(row.work_order_id)));
    const preventiveRows = preventiveResult.data || [];
    const reliabilityRows = reliabilityResult.data || [];
    const drillingReviewRows = drillingReviewResult.data || [];
    const completedOrderRows = completedOrdersResult.data || [];
    const approvedWorkOrderIds = new Set((supervisorReviewsResult.data || []).filter((row:any) => String(row.status || '').toLowerCase() === 'approved').map((row:any) => String(row.work_order_id)));
    const pendingApprovalRows = completedOrderRows.filter((row:any) => !approvedWorkOrderIds.has(String(row.id)));
    const completedSupplyRows = (completedSupplyResult.data || []).filter((row:any) =>
      Number(row.material_shortage_count || 0) > 0 ||
      Number(row.open_supply_need_count || 0) > 0 ||
      Number(row.open_procurement_request_count || 0) > 0 ||
      Number(row.undelivered_order_count || 0) > 0
    );

    const completedSupplyOrderIds = completedSupplyRows.slice(0, 50).map((row:any) => String(row.work_order_id));
    const materialRequirementsResult = completedSupplyOrderIds.length
      ? await context.supabase
          .from('work_order_material_requirements')
          .select('work_order_id,canonical_product_id,quantity_shortage,status')
          .eq('organization_id', context.organizationId)
          .in('work_order_id', completedSupplyOrderIds)
          .gt('quantity_shortage', 0)
          .limit(500)
      : { data: [], error: null } as any;
    if (materialRequirementsResult.error) throw materialRequirementsResult.error;

    const requiredProductIds = [...new Set((materialRequirementsResult.data || [])
      .map((row:any) => String(row.canonical_product_id || ''))
      .filter(Boolean))].slice(0, 50);
    const currentStockResult = requiredProductIds.length
      ? await context.supabase
          .from('laudus_inventory_reconciliation_service_v1')
          .select('canonical_product_id,sku,laudus_stock,laudus_synced_at')
          .eq('organization_id', context.organizationId)
          .in('canonical_product_id', requiredProductIds)
          .limit(100)
      : { data: [], error: null } as any;
    if (currentStockResult.error) throw currentStockResult.error;

    const currentStockByProduct = new Map<string, { laudus_stock?: number | string | null }>(
      (currentStockResult.data || []).map((row:any) => [String(row.canonical_product_id || ''), row]),
    );
    const shortagesByOrder = new Map<string, any[]>();
    for (const requirement of materialRequirementsResult.data || []) {
      const key = String(requirement.work_order_id || '');
      const rows = shortagesByOrder.get(key) || [];
      rows.push(requirement);
      shortagesByOrder.set(key, rows);
    }

    const actions: ActionItem[] = [];

    for (const row of meterReviewResult.data || []) {
      const reason = row.reason === 'meter_decrease' ? 'horómetro disminuyó'
        : row.reason === 'physically_impossible_increase' ? 'incremento superior al tiempo transcurrido'
        : 'fecha o lectura inconsistente';
      actions.push({
        id: `meter-anomaly:${row.id}`,
        kind: 'meter_review',
        priority: 4,
        title: 'Verificar horómetro · lectura retenida',
        description: `${row.previous_hours ?? '—'} h → ${row.submitted_hours} h · ${reason}`,
        evidence: `Registrado ${new Date(row.attempted_at).toLocaleString('es-CL')} · no afecta planes preventivos`,
        href: '/dashboard/mantenimiento/horometros',
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    for (const row of drillingReviewRows) {
      const outOfService = isOutOfServiceReview(row);
      const equipment = row.asset_code || row.asset_name || 'Equipo';
      const observation = String(row.machine_observations || row.review_reason || 'Observación operacional pendiente de revisión').trim();
      const dateEvidence = row.operation_date ? ` · ${row.operation_date}` : '';
      const reviewPriority = outOfService ? 'critical' : 'high';
      actions.push({
        id: `operational-review:${row.review_id}`,
        kind: 'operational_review',
        priority: outOfService ? 5 : 15,
        title: `${outOfService ? 'Equipo fuera de servicio' : 'Revisar señal operacional'} · ${equipment}`,
        description: `${row.asset_name || equipment} · ${row.equipment_status_raw || 'Observación de terreno'}`,
        evidence: `${observation}${dateEvidence}`,
        href: `/dashboard/mantenimiento/ordenes-trabajo/create?reviewId=${encodeURIComponent(String(row.review_id))}&workType=corrective&priority=${reviewPriority}`,
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    for (const row of pendingApprovalRows) {
      actions.push({
        id: `approval:${row.id}`,
        kind: 'approval_needed',
        priority: 8,
        title: `Aprobar cierre · ${row.work_order_number || 'OT'}`,
        description: `${row.title || 'Orden de trabajo terminada'}${row.assigned_to_name ? ` · ${row.assigned_to_name}` : ''}`,
        evidence: row.completion_date ? `Terminada ${new Date(row.completion_date).toLocaleString('es-CL')}` : 'OT terminada pendiente de revisión',
        href: `/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(String(row.id))}`,
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    for (const row of completedSupplyRows) {
      const shortages = Number(row.material_shortage_count || 0);
      const openNeeds = Number(row.open_supply_need_count || 0);
      const openRequests = Number(row.open_procurement_request_count || 0);
      const undelivered = Number(row.undelivered_order_count || 0);
      const requirements = shortagesByOrder.get(String(row.work_order_id)) || [];
      const coveredNow = requirements.filter((requirement:any) => {
        const stock = currentStockByProduct.get(String(requirement.canonical_product_id || ''));
        return Number(stock?.laudus_stock || 0) >= Number(requirement.quantity_shortage || 0);
      }).length;
      const allShortagesCoveredNow = requirements.length > 0 && coveredNow === requirements.length;
      const parts = [
        shortages > 0 ? `${shortages} faltante(s) histórico(s)` : null,
        requirements.length > 0 ? `${coveredNow}/${requirements.length} hoy cubiertos por stock Laudus` : null,
        openNeeds > 0 ? `${openNeeds} necesidad(es) abierta(s)` : null,
        openRequests > 0 ? `${openRequests} solicitud(es) de compra abierta(s)` : null,
        undelivered > 0 ? `${undelivered} orden(es) aún no entregada(s)` : null,
      ].filter(Boolean).join(' · ');
      actions.push({
        id: `supply-integrity:${row.work_order_id}`,
        kind: 'operational_blocker',
        priority: 9,
        title: `${allShortagesCoveredNow ? 'Cerrar brecha de abastecimiento histórica' : 'Conciliar abastecimiento post-cierre'} · ${row.work_order_number || 'OT'}`,
        description: allShortagesCoveredNow
          ? 'La OT terminó con faltantes registrados, pero el stock Laudus actual cubre todos los materiales pendientes. Validar antes de comprar y cerrar la necesidad obsoleta.'
          : row.title || 'Orden terminada con abastecimiento todavía pendiente',
        evidence: parts || row.supply_chain_status || 'Cadena de abastecimiento pendiente después del cierre',
        href: `/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(String(row.work_order_id))}`,
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    for (const row of unassignedOperationalOrders) {
      actions.push({
        id: `assignment:${row.id}`,
        kind: 'assignment_needed',
        priority: 12,
        title: `Asignar responsable · ${row.work_order_number || 'OT'}`,
        description: row.title || 'Orden de trabajo abierta sin responsable operativo',
        evidence: 'La OT no puede iniciar ejecución hasta quedar vinculada a una persona operativa.',
        href: `/dashboard/mantenimiento/ordenes-trabajo/${encodeURIComponent(String(row.id))}`,
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    const overduePreventiveGroups = new Map<string, any[]>();
    for (const row of preventiveRows) {
      if (row.hour_status === 'overdue' && !row.generated_work_order_id) {
        const key = preventiveGroupKey(row);
        const existing = overduePreventiveGroups.get(key) || [];
        existing.push(row);
        overduePreventiveGroups.set(key, existing);
      } else if (row.hour_status === 'needs_review') {
        actions.push({
          id: `meter-review:${row.schedule_id}`,
          kind: 'meter_review',
          priority: 20,
          title: `Revisar base de horómetro · ${row.task_name || 'Pauta'}`,
          description: `${row.asset_code || 'Equipo'} · la lectura nueva contradice el snapshot de la pauta`,
          evidence: 'No se genera alerta automática hasta resolver la evidencia.',
          href: '/dashboard/mantenimiento/horometros',
          assetHref: assetHref(row.canonical_asset_id),
        });
      }
    }

    for (const [key, rows] of overduePreventiveGroups) {
      const row = rows[0];
      const grouped = rows.length > 1;
      const equipment = row.asset_code || row.asset_name || 'Equipo';
      const taskNames = rows.map((item:any) => String(item.task_name || 'Pauta'));
      const overdueHours = Math.max(...rows.map((item:any) => Math.abs(Number(item.remaining_hours || 0))));
      const params = new URLSearchParams();
      if (row.canonical_asset_id) params.set('assetId', String(row.canonical_asset_id));
      if (row.due_meter != null) params.set('dueMeter', String(row.due_meter));
      const query = params.toString();
      actions.push({
        id: `preventive-group:${key}`,
        kind: 'preventive_overdue',
        priority: 10,
        title: grouped ? `Coordinar ${rows.length} preventivos vencidos · ${equipment}` : `Planificar preventivo vencido · ${taskNames[0]}`,
        description: grouped ? `${row.asset_name || equipment} · ${taskNames.join(' · ')}` : `${equipment} · ${row.asset_name || 'Sin nombre'}`,
        evidence: `${overdueHours.toLocaleString('es-CL')} h vencidas · frecuencia ${Number(row.frequency_hours || 0).toLocaleString('es-CL')} h${grouped ? ' · agrupación operativa, pautas independientes' : ''}`,
        href: `/dashboard/mantenimiento/preventivo-horas${query ? `?${query}` : ''}`,
        assetHref: assetHref(row.canonical_asset_id),
      });
    }

    for (const row of closeRows) {
      const number = row.work_order_number || 'OT';
      const href = `/dashboard/mantenimiento/ordenes-trabajo/cierre?workOrderId=${row.work_order_id}`;
      const common = { assetHref: assetHref(row.canonical_asset_id) };
      if (Number(row.open_procurement_orders || 0) > 0 || Number(row.pending_parts || 0) > 0 || Number(row.unmet_material_requirements || 0) > 0 || Number(row.pending_external_services || 0) > 0 || Number(row.open_labor_entries || 0) > 0 || Boolean(row.external_cost_conflict)) {
        actions.push({ id:`blocked:${row.work_order_id}`, kind:'operational_blocker', priority:30, title:`Resolver bloqueo operacional · ${number}`, description:row.title || 'Orden de trabajo', evidence:row.next_action || 'Bloqueo operativo', href, ...common });
      } else if (Number(row.standard_plan_steps_pending || 0) > 0) {
        actions.push({ id:`plan:${row.work_order_id}`, kind:'plan_step', priority:40, title:`Ejecutar procedimiento · ${number}`, description:row.next_plan_step_title || row.title || 'Paso pendiente', evidence:`${Number(row.standard_plan_steps_completed || 0)}/${Number(row.standard_plan_steps_total || 0)} pasos realizados`, href, ...common });
      } else if (row.ready_to_close) {
        actions.push({ id:`close:${row.work_order_id}`, kind:'ready_to_close', priority:50, title:`Cerrar OT · ${number}`, description:row.title || 'Orden de trabajo', evidence:'Todos los controles obligatorios están satisfechos.', href, ...common });
      } else {
        const actionLabels: Record<string,string> = {
          resolve_asset: 'Resolver activo canónico',
          record_root_cause: 'Registrar causa raíz',
          record_preventive_actions: 'Registrar acción preventiva',
          record_actual_hours: 'Registrar horas reales',
          record_runtime_evidence: 'Resolver horómetro',
        };
        actions.push({ id:`evidence:${row.work_order_id}`, kind:'closure_evidence', priority:60, title:`${actionLabels[row.next_action] || 'Completar evidencia'} · ${number}`, description:row.title || 'Orden de trabajo', evidence:'Requisito pendiente para cierre auditado.', href, ...common });
      }
    }

    for (const row of reliabilityRows) {
      if (row.has_recurring_root_cause) {
        actions.push({ id:`reliability:${row.canonical_asset_id}`, kind:'reliability', priority:70, title:`Revisar recurrencia · ${row.asset_code || 'Equipo'}`, description:row.asset_name || 'Activo', evidence:`${Number(row.recurring_cause_count || 0)} causa(s) recurrente(s) · máximo ${Number(row.max_same_cause_occurrences || 0)} repeticiones`, href:'/dashboard/mantenimiento/confiabilidad', assetHref:assetHref(row.canonical_asset_id) });
      }
    }

    actions.sort((a,b) => a.priority - b.priority || a.title.localeCompare(b.title, 'es'));

    return NextResponse.json({
      summary: {
        openWorkOrders: closeRows.length,
        unassignedOpenWorkOrders: unassignedOperationalOrders.length,
        historicalOpenWorkOrders: Math.max(0, allCloseRows.length - closeRows.length),
        overdueHourSchedules: preventiveRows.filter((row:any) => row.hour_status === 'overdue').length,
        unplannedOverdueHourSchedules: preventiveRows.filter((row:any) => row.hour_status === 'overdue' && !row.generated_work_order_id).length,
        unplannedOverdueInterventionGroups: overduePreventiveGroups.size,
        plannedOverdueHourSchedules: preventiveRows.filter((row:any) => row.hour_status === 'overdue' && Boolean(row.generated_work_order_id)).length,
        pendingOperationalReviews: drillingReviewRows.length,
        pendingMeterReviews: (meterReviewResult.data || []).length,
        outOfServiceOperationalReviews: drillingReviewRows.filter((row:any) => isOutOfServiceReview(row)).length,
        operationallyBlocked: closeRows.filter((row:any) => Number(row.open_procurement_orders || 0) > 0 || Number(row.pending_parts || 0) > 0 || Number(row.unmet_material_requirements || 0) > 0 || Number(row.pending_external_services || 0) > 0 || Number(row.open_labor_entries || 0) > 0 || Boolean(row.external_cost_conflict)).length,
        pendingPlanSteps: closeRows.reduce((sum:number,row:any) => sum + Number(row.standard_plan_steps_pending || 0), 0),
        readyToClose: closeRows.filter((row:any) => row.ready_to_close).length,
        pendingApprovals: pendingApprovalRows.length,
        completedWithOpenSupply: completedSupplyRows.length,
        recurringReliabilityAssets: reliabilityRows.filter((row:any) => row.has_recurring_root_cause).length,
        totalActions: actions.length,
      },
      actions: actions.slice(0, 100).map((action) => ({
        ...action,
        autopilot: autopilotPreparation(action),
      })),
      canEdit: access.canWrite,
      semantics: {
        preventiveGrouping: 'Las pautas vencidas del mismo activo, vencimiento y frecuencia se agrupan sólo para coordinar la intervención. Cada pauta conserva su identidad y su OT independiente.',
      },
      sources: ['work_order_close_readiness_v2','preventive_maintenance_hour_status_v1','maintenance_reliability_by_asset_v1','maintenance_work_orders','drilling_maintenance_review_queue_v1','work_order_supervisor_reviews','maintenance_meter_review_queue','work_order_supply_chain_v1'],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar el centro de mantenimiento' }, { status: 500 });
  }
}
