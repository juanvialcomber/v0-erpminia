export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const PAGE_SIZE = 1000;
const MAX_LEDGER_ROWS = 20000;
const closedStatuses = new Set(['completed', 'closed', 'cancelled', 'canceled']);

const numeric = (value: unknown) => Number(value || 0);
const text = (value: unknown) => String(value ?? '').trim();
const dateYear = (value: unknown) => {
  const year = new Date(String(value || '')).getUTCFullYear();
  return Number.isFinite(year) ? year : null;
};
const hasOperationalSignal = (value: unknown) => {
  const normalized = text(value).toLowerCase();
  return Boolean(normalized) && !['0', 'no', 'n/a', 'na', '-'].includes(normalized);
};

type LedgerRow = {
  event_id: string;
  event_at: string;
  event_type: string | null;
  recognition_status: string | null;
  source_table: string | null;
  amount: number | string | null;
  work_order_id: string | null;
  cost_center_code: string | null;
};

async function loadAssetLedger(supabase: any, organizationId: string, assetId: string) {
  const rows: LedgerRow[] = [];

  for (let offset = 0; offset < MAX_LEDGER_ROWS; offset += PAGE_SIZE) {
    const { data, error } = await supabase
      .from('canonical_clp_cost_ledger')
      .select('event_id,event_at,event_type,recognition_status,source_table,amount,work_order_id,cost_center_code')
      .eq('organization_id', organizationId)
      .eq('canonical_asset_id', assetId)
      .order('event_at', { ascending: true })
      .range(offset, offset + PAGE_SIZE - 1);

    if (error) throw error;
    const page = (data || []) as LedgerRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return { rows, truncated: false };
  }

  return { rows, truncated: true };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { id } = await params;

  try {
    const [assetResult, reliabilityResult, rootCausesResult, ordersResult, preventiveResult, runtimeResult, operationalReportsResult, ledgerResult] = await Promise.all([
      context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name,asset_type,category,manufacturer,model,serial_number,license_plate,cost_center_code,is_active,validation_status,validation_notes,source_file,source_sheet,source_row')
        .eq('organization_id', context.organizationId)
        .eq('id', id)
        .maybeSingle(),
      context.supabase
        .from('maintenance_reliability_by_asset_v1')
        .select('audited_closures,closures_with_root_cause,distinct_root_causes,recurring_cause_count,max_same_cause_occurrences,audited_total_cost,audited_avg_cost,total_actual_hours,total_downtime_hours,avg_days_between_audited_interventions,has_recurring_root_cause,first_audited_closure_at,last_audited_closure_at')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .maybeSingle(),
      context.supabase
        .from('maintenance_reliability_by_root_cause_v1')
        .select('root_cause,occurrences,audited_total_cost,total_actual_hours,total_downtime_hours,first_seen_at,last_seen_at,is_recurring')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .order('occurrences', { ascending: false })
        .limit(5),
      context.supabase
        .from('maintenance_operational_work_order_flow_v1')
        .select('work_order_id,status,priority,flow_status,work_type,total_cost,scheduled_date')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id),
      context.supabase
        .from('preventive_maintenance_hour_status_v1')
        .select('schedule_id,task_name,hour_status,remaining_hours,alert_due,generated_work_order_id,meter_basis_conflict')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .eq('enabled', true),
      context.supabase
        .from('asset_runtime_summary_v1')
        .select('reading_count,first_reading_at,last_reading_at,latest_meter_hours,observed_operating_hours,reset_count,usable_for_rate_metrics')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .maybeSingle(),
      context.supabase
        .from('production_drilling_source_reports')
        .select('operation_date,drilled_meters,equipment_status_raw,equipment_without_crew_raw,power_outage_raw,water_shortage_raw,machine_observations')
        .eq('organization_id', context.organizationId)
        .eq('canonical_asset_id', id)
        .order('operation_date', { ascending: true })
        .limit(5000),
      loadAssetLedger(context.supabase, context.organizationId, id),
    ]);

    const sourceError = assetResult.error || reliabilityResult.error || rootCausesResult.error || ordersResult.error || preventiveResult.error || runtimeResult.error;
    if (sourceError) throw sourceError;
    if (!assetResult.data) return NextResponse.json({ error: 'Equipo no encontrado' }, { status: 404 });

    const ledger = ledgerResult.rows;
    const recognized = ledger.filter((row) => String(row.recognition_status || '').toLowerCase() === 'recognized');
    const firstEventAt = recognized[0]?.event_at || null;
    const lastEventAt = recognized.at(-1)?.event_at || null;
    const years = new Map<number, { year: number; event_count: number; recognized_clp: number }>();
    const eventTypes = new Map<string, { event_type: string; event_count: number; recognized_clp: number }>();
    const sourceTables = new Set<string>();
    const costCenters = new Set<string>();
    let recognizedClp = 0;
    let ledgerEventsWithWorkOrder = 0;

    for (const row of recognized) {
      const amount = numeric(row.amount);
      recognizedClp += amount;
      if (row.work_order_id) ledgerEventsWithWorkOrder += 1;
      if (row.source_table) sourceTables.add(row.source_table);
      if (row.cost_center_code) costCenters.add(row.cost_center_code);

      const year = dateYear(row.event_at);
      if (year != null) {
        const current = years.get(year) || { year, event_count: 0, recognized_clp: 0 };
        current.event_count += 1;
        current.recognized_clp += amount;
        years.set(year, current);
      }

      const eventType = String(row.event_type || 'Sin clasificar');
      const eventCurrent = eventTypes.get(eventType) || { event_type: eventType, event_count: 0, recognized_clp: 0 };
      eventCurrent.event_count += 1;
      eventCurrent.recognized_clp += amount;
      eventTypes.set(eventType, eventCurrent);
    }

    const annual = [...years.values()].sort((a, b) => a.year - b.year);
    const composition = [...eventTypes.values()].sort((a, b) => b.recognized_clp - a.recognized_clp).slice(0, 8);
    const reliability = reliabilityResult.data || null;
    const orders = ordersResult.data || [];
    const activeOrders = orders.filter((row: any) => !closedStatuses.has(String(row.status || '').toLowerCase()));
    const blockingFlows = new Set(['missing_asset', 'blocked', 'blocked_asset', 'blocked_execution']);
    const operationalBlockers = activeOrders.filter((row: any) => blockingFlows.has(String(row.flow_status || '').toLowerCase())).length;
    const criticalOpen = activeOrders.filter((row: any) => String(row.priority || '').toLowerCase() === 'critical').length;
    const preventives = preventiveResult.data || [];
    const overduePreventives = preventives.filter((row: any) => Boolean(row.alert_due) || String(row.hour_status || '').toLowerCase() === 'overdue');
    const meterConflicts = preventives.filter((row: any) => Boolean(row.meter_basis_conflict)).length;

    // Drilling is supplementary evidence: keep economic history available if this source fails.
    const drillingSourceUnavailable = Boolean(operationalReportsResult.error);
    const reports = drillingSourceUnavailable ? [] : (operationalReportsResult.data || []);
    let drilledMeters = 0;
    let outOfServiceReports = 0;
    let observedReports = 0;
    let operationalReports = 0;
    let externalConstraintReports = 0;
    for (const row of reports as any[]) {
      drilledMeters += numeric(row.drilled_meters);
      const status = text(row.equipment_status_raw).toUpperCase();
      if (status === 'FUERA DE SERVICIO') outOfServiceReports += 1;
      else if (status === 'OPERATIVO CON OBSERVACIONES') observedReports += 1;
      else if (status === 'OPERATIVO') operationalReports += 1;
      if (hasOperationalSignal(row.equipment_without_crew_raw) || hasOperationalSignal(row.power_outage_raw) || hasOperationalSignal(row.water_shortage_raw)) externalConstraintReports += 1;
    }
    const firstOperationalReportAt = reports[0]?.operation_date || null;
    const lastOperationalReportAt = reports.at(-1)?.operation_date || null;
    const degradedReports = outOfServiceReports + observedReports;
    const costDuringObservedUse = firstOperationalReportAt
      ? recognized.filter((row) => new Date(row.event_at).getTime() >= new Date(`${firstOperationalReportAt}T00:00:00Z`).getTime()).reduce((sum, row) => sum + numeric(row.amount), 0)
      : null;

    const runtime = runtimeResult.data || null;
    const technicalIdentityFields = [assetResult.data.manufacturer, assetResult.data.model, assetResult.data.serial_number];
    const technicalIdentityKnown = technicalIdentityFields.filter(Boolean).length;
    const rootCauseCoverage = Number(reliability?.audited_closures || 0) > 0
      ? Math.round((Number(reliability?.closures_with_root_cause || 0) / Number(reliability?.audited_closures || 1)) * 100)
      : null;

    const signals: Array<{ key: string; severity: 'high' | 'medium' | 'info'; fact: string; next_action: string; href: string }> = [];
    if (operationalBlockers > 0) signals.push({
      key: 'blocked-work', severity: 'high',
      fact: `${operationalBlockers} OT activa(s) presentan bloqueo operacional o técnico.`,
      next_action: 'Revisar y destrabar las dependencias antes de comprometer una nueva intervención.',
      href: '/dashboard/mantenimiento/ordenes-trabajo/cierre',
    });
    if (criticalOpen > 0) signals.push({
      key: 'critical-work', severity: 'high',
      fact: `${criticalOpen} OT crítica(s) permanecen abiertas para este equipo.`,
      next_action: 'Revisar diagnóstico, responsable, evidencia y condición segura de operación.',
      href: '/dashboard/mantenimiento/ordenes-trabajo',
    });
    if (overduePreventives.length > 0) signals.push({
      key: 'overdue-preventive', severity: 'medium',
      fact: `${overduePreventives.length} pauta(s) preventiva(s) por horas están vencidas o en alerta.`,
      next_action: meterConflicts > 0 ? 'Resolver primero el conflicto de horómetro y luego confirmar la ventana preventiva.' : 'Confirmar ventana, recursos y generar la OT preventiva si corresponde.',
      href: '/dashboard/mantenimiento/preventivo-horas',
    });
    if (Boolean(reliability?.has_recurring_root_cause)) signals.push({
      key: 'recurring-root-cause', severity: 'medium',
      fact: `${Number(reliability?.recurring_cause_count || 0)} causa(s) raíz auditada(s) presentan recurrencia en cierres modernos.`,
      next_action: 'Revisar la recurrencia y validar si la estrategia preventiva o el job plan requieren cambio.',
      href: '/dashboard/mantenimiento/confiabilidad',
    });
    if (reports.length > 0 && degradedReports > 0 && Number(reliability?.audited_closures || 0) === 0) signals.push({
      key: 'condition-without-diagnosis-history', severity: 'medium',
      fact: `${degradedReports} de ${reports.length} reportes de uso observado registran condición degradada (${outOfServiceReports} fuera de servicio y ${observedReports} con observaciones), pero todavía no existe historia de cierres auditados con causa raíz para este equipo.`,
      next_action: 'Usar esta repetición sólo para priorizar revisión. En la próxima intervención, cerrar con causa, horas, detención y costo auditado para comenzar a explicar el patrón.',
      href: '/dashboard/mantenimiento/decision-intelligence',
    });
    if (technicalIdentityKnown < technicalIdentityFields.length) signals.push({
      key: 'technical-identity-gap', severity: 'info',
      fact: `La identidad técnica está incompleta: ${technicalIdentityKnown}/${technicalIdentityFields.length} campos fabricante, modelo y serie tienen valor.`,
      next_action: 'Completar la identidad técnica sólo con evidencia documental o inspección autorizada.',
      href: `/dashboard/mantenimiento/equipos/${encodeURIComponent(id)}/ficha-tecnica`,
    });
    if (recognized.length > 0 && Number(reliability?.audited_closures || 0) === 0) signals.push({
      key: 'history-without-modern-closure', severity: 'info',
      fact: `${recognized.length.toLocaleString('es-CL')} eventos económicos históricos están vinculados al equipo, pero aún no existe un cierre moderno auditado para relacionarlos con causa y ejecución.`,
      next_action: 'Conservar la historia como evidencia económica y capturar causa, horas, repuestos y costo auditado en los próximos cierres; no reconstruir fallas antiguas sin evidencia.',
      href: '/dashboard/mantenimiento/ordenes-trabajo/cierre',
    });

    return NextResponse.json({
      asset: assetResult.data,
      historicalEconomics: {
        recognized_event_count: recognized.length,
        recognized_clp: recognizedClp,
        first_event_at: firstEventAt,
        last_event_at: lastEventAt,
        years_with_evidence: annual.length,
        ledger_events_with_work_order: ledgerEventsWithWorkOrder,
        source_tables: [...sourceTables].sort(),
        cost_center_codes: [...costCenters].sort(),
        annual,
        composition,
        truncated: ledgerResult.truncated,
      },
      observedUse: {
        drilling_source_status: drillingSourceUnavailable ? 'unavailable' : 'available',
        evidence_type: reports.length > 0 ? 'production_drilling_reports' : runtime && Number(runtime.reading_count || 0) > 0 ? 'runtime_meter' : 'none',
        drilling_report_count: reports.length,
        first_report_at: firstOperationalReportAt,
        last_report_at: lastOperationalReportAt,
        drilled_meters: drilledMeters,
        operational_reports: operationalReports,
        operational_with_observations_reports: observedReports,
        out_of_service_reports: outOfServiceReports,
        degraded_reports: degradedReports,
        external_constraint_reports: externalConstraintReports,
        historical_cost_during_observed_use_clp: costDuringObservedUse,
        runtime: runtime ? {
          reading_count: Number(runtime.reading_count || 0),
          first_reading_at: runtime.first_reading_at,
          last_reading_at: runtime.last_reading_at,
          latest_meter_hours: runtime.latest_meter_hours == null ? null : numeric(runtime.latest_meter_hours),
          observed_operating_hours: numeric(runtime.observed_operating_hours),
          reset_count: Number(runtime.reset_count || 0),
          usable_for_rate_metrics: Boolean(runtime.usable_for_rate_metrics),
        } : null,
      },
      currentExecution: {
        active_work_orders: activeOrders.length,
        critical_open: criticalOpen,
        operational_blockers: operationalBlockers,
        overdue_preventives: overduePreventives.length,
        meter_basis_conflicts: meterConflicts,
      },
      auditedReliability: reliability ? {
        audited_closures: Number(reliability.audited_closures || 0),
        closures_with_root_cause: Number(reliability.closures_with_root_cause || 0),
        root_cause_coverage_percent: rootCauseCoverage,
        distinct_root_causes: Number(reliability.distinct_root_causes || 0),
        recurring_cause_count: Number(reliability.recurring_cause_count || 0),
        max_same_cause_occurrences: Number(reliability.max_same_cause_occurrences || 0),
        audited_total_cost: numeric(reliability.audited_total_cost),
        total_downtime_hours: numeric(reliability.total_downtime_hours),
        first_audited_closure_at: reliability.first_audited_closure_at,
        last_audited_closure_at: reliability.last_audited_closure_at,
        root_causes: (rootCausesResult.data || []).map((row: any) => ({
          root_cause: row.root_cause,
          occurrences: Number(row.occurrences || 0),
          audited_total_cost: numeric(row.audited_total_cost),
          total_actual_hours: numeric(row.total_actual_hours),
          total_downtime_hours: numeric(row.total_downtime_hours),
          first_seen_at: row.first_seen_at,
          last_seen_at: row.last_seen_at,
          is_recurring: Boolean(row.is_recurring),
        })),
      } : null,
      identityReadiness: {
        validation_status: assetResult.data.validation_status || null,
        technical_fields_known: technicalIdentityKnown,
        technical_fields_total: technicalIdentityFields.length,
        has_cost_center: Boolean(assetResult.data.cost_center_code),
        lineage: {
          source_file: assetResult.data.source_file || null,
          source_sheet: assetResult.data.source_sheet || null,
          source_row: assetResult.data.source_row || null,
        },
      },
      signals,
      semantics: {
        historical_cost: 'Gasto reconocido del ledger canónico ya vinculado explícitamente al activo. No se atribuye a una falla ni a una OT si el registro no trae ese vínculo.',
        audited_cost: 'Costo de ejecución moderna sólo desde cierres auditados. Se mantiene separado del histórico.',
        observed_use: 'Uso observado proviene de reportes operacionales de producción o de horómetro cuando existe evidencia suficiente. Metros perforados no equivalen a horas de operación.',
        observed_condition: 'Fuera de servicio y operativo con observaciones son estados reportados en terreno; sirven para priorizar revisión, no para afirmar causa mecánica.',
        overlap_cost: 'El costo durante el período con uso observado es una coincidencia temporal descriptiva; no es costo por metro ni demuestra causalidad.',
        operational_risk: 'Las señales ordenan atención con hechos observados; no representan probabilidad de falla ni un score predictivo.',
        human_authority: 'Diagnóstico, prioridad, intervención y cambios de estrategia requieren validación humana.',
      },
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar la historia económica-operacional del equipo' }, { status: 500 });
  }
}
