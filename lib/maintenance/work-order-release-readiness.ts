import type { SupabaseClient } from '@supabase/supabase-js';

type OrderRow = {
  id: string;
  canonical_asset_id: string | null;
  assigned_person_id: string | null;
  scheduled_date: string | null;
  work_type: string | null;
};

type ReadinessRow = {
  open_procurement_orders?: number | string | null;
  pending_parts?: number | string | null;
  unmet_material_requirements?: number | string | null;
  pending_external_services?: number | string | null;
  open_labor_entries?: number | string | null;
  external_cost_conflict?: boolean | null;
};

export type WorkOrderReleaseReadiness = {
  ready: boolean;
  emergencyBypass: boolean;
  blockers: Array<{ code: string; label: string; count?: number }>;
  checks: {
    asset: boolean;
    assignee: boolean;
    schedule: boolean;
    procurement: boolean;
    parts: boolean;
    materials: boolean;
    externalServices: boolean;
    labor: boolean;
    costConflict: boolean;
  };
};

export async function getWorkOrderReleaseReadiness(
  supabase: SupabaseClient,
  organizationId: string,
  workOrderId: string,
): Promise<WorkOrderReleaseReadiness> {
  const [{ data: order, error: orderError }, { data: readiness, error: readinessError }] = await Promise.all([
    supabase
      .from('maintenance_work_orders')
      .select('id,canonical_asset_id,assigned_person_id,scheduled_date,work_type')
      .eq('organization_id', organizationId)
      .eq('id', workOrderId)
      .maybeSingle(),
    supabase
      .from('work_order_close_readiness_v2')
      .select('open_procurement_orders,pending_parts,unmet_material_requirements,pending_external_services,open_labor_entries,external_cost_conflict')
      .eq('organization_id', organizationId)
      .eq('work_order_id', workOrderId)
      .maybeSingle(),
  ]);
  if (orderError) throw orderError;
  if (readinessError) throw readinessError;
  if (!order) throw new Error('No se encontró la orden de trabajo');

  const typedOrder = order as OrderRow;
  const typedReadiness = (readiness || {}) as ReadinessRow;
  const emergencyBypass = String(typedOrder.work_type || '').toLowerCase() === 'emergency';

  const checks = {
    asset: Boolean(typedOrder.canonical_asset_id),
    assignee: Boolean(typedOrder.assigned_person_id),
    schedule: Boolean(typedOrder.scheduled_date),
    procurement: Number(typedReadiness.open_procurement_orders || 0) === 0,
    parts: Number(typedReadiness.pending_parts || 0) === 0,
    materials: Number(typedReadiness.unmet_material_requirements || 0) === 0,
    externalServices: Number(typedReadiness.pending_external_services || 0) === 0,
    labor: Number(typedReadiness.open_labor_entries || 0) === 0,
    costConflict: !Boolean(typedReadiness.external_cost_conflict),
  };

  const blockers: WorkOrderReleaseReadiness['blockers'] = [];
  if (!checks.asset) blockers.push({ code: 'asset', label: 'Vincular activo canónico' });
  if (!checks.assignee) blockers.push({ code: 'assignee', label: 'Asignar responsable' });

  if (!emergencyBypass) {
    if (!checks.schedule) blockers.push({ code: 'schedule', label: 'Programar fecha de ejecución' });
    const operational = [
      ['procurement', 'Cerrar compras abiertas', Number(typedReadiness.open_procurement_orders || 0)],
      ['parts', 'Resolver repuestos pendientes', Number(typedReadiness.pending_parts || 0)],
      ['materials', 'Resolver faltantes de materiales', Number(typedReadiness.unmet_material_requirements || 0)],
      ['external_services', 'Resolver servicios externos pendientes', Number(typedReadiness.pending_external_services || 0)],
      ['labor', 'Cerrar registros de trabajo abiertos', Number(typedReadiness.open_labor_entries || 0)],
    ] as const;
    for (const [code, label, count] of operational) {
      if (count > 0) blockers.push({ code, label, count });
    }
    if (!checks.costConflict) blockers.push({ code: 'cost_conflict', label: 'Resolver conflicto de costo externo' });
  }

  return { ready: blockers.length === 0, emergencyBypass, blockers, checks };
}
