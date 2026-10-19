export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getInventoryConflictEvidence } from '@/lib/inventory-trust';

function textValue(value: unknown) {
  const valueText = String(value ?? '').trim();
  return valueText || null;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priorityRank(priority: unknown) {
  const value = String(priority ?? '').toUpperCase();
  if (value.startsWith('P1') || value === 'CRITICAL') return 1;
  if (value.startsWith('P2') || value === 'HIGH') return 2;
  if (value.startsWith('P3') || value === 'MEDIUM') return 3;
  if (value.startsWith('P4') || value === 'LOW') return 4;
  return 9;
}

function preventiveStatusRank(status: unknown) {
  const value = String(status ?? '');
  if (/vencid/i.test(value)) return 1;
  if (/pr[oó]xim/i.test(value)) return 2;
  if (/revisar fecha/i.test(value)) return 3;
  return 9;
}

function newest(...values: Array<string | null | undefined>) {
  return values.filter((value): value is string => Boolean(value)).sort().at(-1) || null;
}

function sameOrAfter(value: string | null, cutoff: string | null) {
  if (!value || !cutoff) return Boolean(value);
  return value >= cutoff;
}

function isStoppedSignal(value: unknown) {
  return /fuera de servicio|detenid|inoperativ|no operativo|f\/s|queda en pana|en pana/i.test(String(value ?? ''));
}

function isPartsPending(value: unknown) {
  return /pendiente|faltante|solicitud|solicitad|espera de repuesto|repuesto/i.test(String(value ?? ''));
}

function isClosed(status: unknown) {
  return ['completed', 'closed', 'cancelled', 'canceled'].includes(String(status ?? '').toLowerCase());
}

function santiagoDay(offsetDays = 0) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(Date.now() + offsetDays * 86400000));
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [
      assetsResult,
      planningResult,
      emailResult,
      whatsappResult,
      statusResult,
      workOrdersResult,
      pendingEmailResult,
      latestEmailResult,
      whatsappInputResult,
      supplyChainResult,
      workOrderEvidenceResult,
      supervisorReviewsResult,
      preventiveSchedulesResult,
      materialRequirementsResult,
      canonicalProductsResult,
      bodegaInventoryResult,
      inventoryConflictEvidence,
    ] = await Promise.all([
      context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name,asset_type,category,manufacturer,model,is_active,validation_status,updated_at')
        .eq('organization_id', context.organizationId)
        .eq('is_active', true)
        .order('name')
        .limit(5000),
      context.supabase
        .from('planning_maintenance_priority_v1')
        .select('source_row_id,canonical_asset_id,asset_code,asset_name,mine_raw,meter_unit,interval_mp,last_mp,next_due_meter,current_reading_at,current_reading,remaining_meter,projected_days,projected_due_at,criticality_raw,criticality_score,total_score,priority,recommended_action,scheduled_date,programming_status_raw,responsible_raw,parts_status_raw,observations,source_file,imported_at')
        .eq('organization_id', context.organizationId)
        .not('canonical_asset_id', 'is', null)
        .order('imported_at', { ascending: false, nullsFirst: false })
        .order('source_row', { ascending: false })
        .limit(5000),
      context.supabase
        .from('motil_email_equipment_meter_stage')
        .select('id,candidate_asset_id,report_date,mine_name,meter_unit,meter_value,next_maintenance_meter,reported_mp_status,reported_equipment_status,reported_issue,reported_work,parts_requested,evidence_status,review_status,source_manifest_id,updated_at')
        .eq('organization_id', context.organizationId)
        .not('candidate_asset_id', 'is', null)
        .order('report_date', { ascending: false, nullsFirst: false })
        .order('updated_at', { ascending: false })
        .limit(5000),
      context.supabase
        .from('motil_whatsapp_asset_360_latest_v1')
        .select('asset_id,asset_code,asset_name,operation_date,source_occurred_at,sender_name,whatsapp_group,description,event_class,evidence_state,stored_evidence_count')
        .eq('organization_id', context.organizationId)
        .order('source_occurred_at', { ascending: false, nullsFirst: false })
        .limit(5000),
      context.supabase
        .from('maintenance_asset_status_history')
        .select('asset_id,new_state,reason,changed_at,source')
        .eq('organization_id', context.organizationId)
        .order('changed_at', { ascending: false })
        .limit(5000),
      context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,canonical_asset_id,title,description,work_type,status,priority,scheduled_date,start_date,completion_date,planned_duration_hours,actual_duration_hours,down_time_hours,assigned_to_name,timer_status,total_timer_minutes,total_timer_seconds,workshop_site,created_at,updated_at')
        .eq('organization_id', context.organizationId)
        .order('scheduled_date', { ascending: false, nullsFirst: false })
        .order('created_at', { ascending: false })
        .limit(1000),
      context.supabase
        .from('motil_email_equipment_meter_stage')
        .select('id,report_date,asset_name_raw,mine_name,reported_equipment_status,reported_issue,reported_work,parts_requested,review_status')
        .eq('organization_id', context.organizationId)
        .is('candidate_asset_id', null)
        .order('report_date', { ascending: false })
        .limit(250),
      context.supabase
        .from('motil_email_source_manifest')
        .select('email_sent_at,email_sender,email_subject,filename,ingest_state,domain')
        .eq('organization_id', context.organizationId)
        .eq('domain', 'maintenance')
        .ilike('email_sender', '%@lapatagua.cl%')
        .order('email_sent_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('motil_whatsapp_message_registry_v1')
        .select('message_id,group_name,sender_name,occurred_at,body,activity_count,published_count,exception_count,registry_state')
        .eq('organization_id', context.organizationId)
        .eq('group_name', 'Grupo 2')
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(40),
      context.supabase
        .from('work_order_supply_chain_v1')
        .select('work_order_id,work_order_number,material_requirement_count,material_shortage_count,open_supply_need_count,open_procurement_request_count,undelivered_order_count,part_line_count,parts_requested,parts_issued,parts_installed,supply_chain_status')
        .eq('organization_id', context.organizationId)
        .limit(1000),
      context.supabase
        .from('work_order_evidence_files')
        .select('work_order_id,id,evidence_type,captured_at,created_at')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('work_order_supervisor_reviews')
        .select('work_order_id,id,status,reviewed_at,reviewed_by_name')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('preventive_maintenance_schedules')
        .select('id,canonical_asset_id,frequency_days,frequency_hours,meter_unit,next_scheduled_date,enabled')
        .eq('organization_id', context.organizationId)
        .eq('enabled', true)
        .limit(5000),
      context.supabase
        .from('work_order_material_requirements')
        .select('id,work_order_id,canonical_product_id,quantity_required,status,required_date')
        .eq('organization_id', context.organizationId)
        .limit(5000),
      context.supabase
        .from('canonical_products_v1')
        .select('id,product_code,name,is_active')
        .eq('organization_id', context.organizationId)
        .eq('is_active', true)
        .limit(20000),
      context.supabase
        .from('bodega_inventory')
        .select('sku,name,quantity,quantity_reported,updated_at')
        .limit(10000),
      getInventoryConflictEvidence(context.supabase, context.organizationId),
    ]);

    const error =
      assetsResult.error || planningResult.error || emailResult.error || whatsappResult.error ||
      statusResult.error || workOrdersResult.error || pendingEmailResult.error ||
      latestEmailResult.error || whatsappInputResult.error || supplyChainResult.error || workOrderEvidenceResult.error || supervisorReviewsResult.error || preventiveSchedulesResult.error || materialRequirementsResult.error || canonicalProductsResult.error || bodegaInventoryResult.error;
    if (error) throw error;

    const assets = assetsResult.data || [];
    const planningRows = planningResult.data || [];
    const emailRows = emailResult.data || [];
    const whatsappRows = whatsappResult.data || [];
    const statusRows = statusResult.data || [];
    const workOrders = workOrdersResult.data || [];
    const productById = new Map(
      (canonicalProductsResult.data || []).map((row: any) => [String(row.id), row])
    );
    const organizationProductSkus = new Set(
      (canonicalProductsResult.data || [])
        .map((row: any) => textValue(row.product_code)?.trim().toUpperCase())
        .filter(Boolean)
    );
    const matchedBodegaRows = (bodegaInventoryResult.data || []).filter((row: any) =>
      row.sku && organizationProductSkus.has(String(row.sku).trim().toUpperCase())
    );
    const trustedBodegaRows = matchedBodegaRows.filter((row: any) =>
      !inventoryConflictEvidence.conflictCodes.has(String(row.sku || '').trim().toUpperCase())
    );
    const bodegaBySku = new Map(
      trustedBodegaRows.map((row: any) => [String(row.sku).trim().toUpperCase(), row])
    );
    const requirementsByWorkOrder = new Map<string, any[]>();
    for (const row of materialRequirementsResult.data || []) {
      const workOrderId = String(row.work_order_id || '');
      if (!workOrderId) continue;
      const rows = requirementsByWorkOrder.get(workOrderId) || [];
      rows.push(row);
      requirementsByWorkOrder.set(workOrderId, rows);
    }
    const bodegaLatestAt = newest(...trustedBodegaRows.map((row: any) => textValue(row.updated_at)));

    const activePreventiveSchedules = preventiveSchedulesResult.data || [];
    const supplyRows = supplyChainResult.data || [];
    const supplyByWorkOrder = new Map(supplyRows.map((row: any) => [String(row.work_order_id || ''), row]));
    const evidenceCountByWorkOrder = new Map<string, number>();
    for (const row of workOrderEvidenceResult.data || []) {
      const id = String(row.work_order_id || '');
      if (id) evidenceCountByWorkOrder.set(id, (evidenceCountByWorkOrder.get(id) || 0) + 1);
    }
    const reviewCountByWorkOrder = new Map<string, number>();
    for (const row of supervisorReviewsResult.data || []) {
      const id = String(row.work_order_id || '');
      if (id) reviewCountByWorkOrder.set(id, (reviewCountByWorkOrder.get(id) || 0) + 1);
    }

    const latestPlanning = new Map<string, any>();
    for (const row of planningRows) {
      const id = String(row.canonical_asset_id || '');
      if (id && !latestPlanning.has(id)) latestPlanning.set(id, row);
    }

    const latestEmail = new Map<string, any>();
    for (const row of emailRows) {
      const id = String(row.candidate_asset_id || '');
      if (id && !latestEmail.has(id)) latestEmail.set(id, row);
    }

    const latestWhatsapp = new Map<string, any>();
    for (const row of whatsappRows) {
      const id = String(row.asset_id || '');
      if (id && !latestWhatsapp.has(id)) latestWhatsapp.set(id, row);
    }

    const latestStatus = new Map<string, any>();
    for (const row of statusRows) {
      const id = String(row.asset_id || '');
      if (id && !latestStatus.has(id)) latestStatus.set(id, row);
    }

    const workOrdersByAsset = new Map<string, any[]>();
    for (const workOrder of workOrders) {
      const id = String(workOrder.canonical_asset_id || '');
      if (!id) continue;
      const bucket = workOrdersByAsset.get(id) || [];
      bucket.push(workOrder);
      workOrdersByAsset.set(id, bucket);
    }

    const latestEmailAt = textValue(latestEmailResult.data?.email_sent_at);
    const whatsappInputs = whatsappInputResult.data || [];
    const latestWhatsAppAt = textValue(whatsappInputs[0]?.occurred_at);
    const operationalCutoff = newest(
      latestEmailAt ? latestEmailAt.slice(0, 10) : null,
      latestWhatsAppAt ? latestWhatsAppAt.slice(0, 10) : null,
    );

    const currentWhatsappInputs = whatsappInputs.filter((row: any) =>
      !operationalCutoff || sameOrAfter(textValue(row.occurred_at)?.slice(0, 10) || null, operationalCutoff)
    );
    const pendingWhatsappInputs = currentWhatsappInputs.filter((row: any) =>
      Number(row.published_count || 0) === 0
    );
    const latestPublishedWhatsappAt = newest(...whatsappRows.map((row: any) => textValue(row.source_occurred_at)));

    const rows = assets.map((asset: any) => {
      const id = String(asset.id);
      const plan = latestPlanning.get(id) || null;
      const email = latestEmail.get(id) || null;
      const whatsapp = latestWhatsapp.get(id) || null;
      const status = latestStatus.get(id) || null;
      const assetOrders = workOrdersByAsset.get(id) || [];
      const openOrders = assetOrders.filter((order) => !isClosed(order.status));

      const planningAt = textValue(plan?.imported_at);
      const emailAt = textValue(email?.report_date);
      const whatsappAt = textValue(whatsapp?.source_occurred_at);
      const statusAt = textValue(status?.changed_at);
      const workOrderAt = newest(...assetOrders.map((order) => textValue(order.updated_at)));
      const latestSignalAt = newest(statusAt, planningAt, emailAt, whatsappAt, workOrderAt);
      const planningCurrent = Boolean(planningAt) && (!operationalCutoff || sameOrAfter(planningAt?.slice(0, 10) || null, operationalCutoff));

      const emailCurrent = Boolean(emailAt) && (!operationalCutoff || sameOrAfter(emailAt, operationalCutoff));
      const whatsappCurrent = whatsappAt ? (!operationalCutoff || sameOrAfter(whatsappAt.slice(0, 10), operationalCutoff)) : false;
      const emailMeter = emailCurrent ? numberValue(email?.meter_value) : null;
      const planMeter = planningCurrent ? numberValue(plan?.current_reading) : null;
      const emailMeterUsable = emailMeter != null && (!plan?.meter_unit || !email?.meter_unit || String(plan.meter_unit).toLowerCase() === String(email.meter_unit).toLowerCase());
      const effectiveMeter = emailMeterUsable && (!planningAt || sameOrAfter(emailAt, planningAt.slice(0, 10))) ? emailMeter : planMeter;
      const nextDueMeter = (emailCurrent ? numberValue(email?.next_maintenance_meter) : null) ?? (planningCurrent ? numberValue(plan?.next_due_meter) : null);
      const effectiveRemaining = effectiveMeter != null && nextDueMeter != null
        ? nextDueMeter - effectiveMeter
        : planningCurrent ? numberValue(plan?.remaining_meter) : null;

      let latestSignalSource = 'asset_master';
      if (latestSignalAt === emailAt) latestSignalSource = 'email';
      else if (latestSignalAt === whatsappAt) latestSignalSource = 'whatsapp';
      else if (latestSignalAt === statusAt) latestSignalSource = 'canonical_status';
      else if (latestSignalAt === workOrderAt) latestSignalSource = 'work_order';
      else if (latestSignalAt === planningAt) latestSignalSource = 'planning_master';

      const currentReportedStatus =
        textValue(status?.new_state) ||
        (emailCurrent ? textValue(email?.reported_equipment_status) : null) ||
        (whatsappCurrent && isStoppedSignal(whatsapp?.description) ? 'Reportado fuera de servicio' : null);

      const stopped =
        isStoppedSignal(status?.new_state) ||
        (emailCurrent && isStoppedSignal(email?.reported_equipment_status)) ||
        (whatsappCurrent && isStoppedSignal(whatsapp?.description));

      const partsPending =
        (planningCurrent && isPartsPending(plan?.parts_status_raw)) ||
        (emailCurrent && isPartsPending(email?.parts_requested)) ||
        (emailCurrent && isPartsPending(email?.reported_issue)) ||
        (whatsappCurrent && isPartsPending(whatsapp?.description));

      const rank = planningCurrent ? priorityRank(plan?.priority) : 9;
      const activeRecommendation = planningCurrent ? textValue(plan?.recommended_action) : null;

      return {
        canonicalAssetId: id,
        assetCode: textValue(asset.asset_code),
        assetName: textValue(asset.name) || 'Equipo sin nombre',
        assetType: textValue(asset.asset_type),
        category: textValue(asset.category),
        site: textValue(email?.mine_name) || textValue(plan?.mine_raw) || textValue(openOrders[0]?.workshop_site) || 'Sin faena',
        validationStatus: textValue(asset.validation_status),
        canonicalStatus: textValue(status?.new_state),
        canonicalStatusReason: textValue(status?.reason),
        canonicalStatusChangedAt: statusAt,

        planningPriority: planningCurrent ? textValue(plan?.priority) : null,
        priorityRank: rank,
        planningCurrent,
        emailCurrent,
        whatsappCurrent,
        currentCoverage: emailCurrent || whatsappCurrent || Boolean(status?.new_state) || openOrders.length > 0,
        planningImportedAt: planningAt,
        planningSourceFile: textValue(plan?.source_file),
        planningScheduledDate: planningCurrent ? textValue(plan?.scheduled_date) : null,
        programmingStatus: planningCurrent ? textValue(plan?.programming_status_raw) : null,
        responsible: planningCurrent ? textValue(plan?.responsible_raw) : null,
        partsStatus: planningCurrent ? textValue(plan?.parts_status_raw) : null,
        planningObservations: planningCurrent ? textValue(plan?.observations) : null,
        recommendedAction: activeRecommendation,
        criticality: planningCurrent ? textValue(plan?.criticality_raw) : null,
        criticalityScore: planningCurrent ? numberValue(plan?.criticality_score) : null,
        projectedDays: planningCurrent ? numberValue(plan?.projected_days) : null,
        projectedDueAt: planningCurrent ? textValue(plan?.projected_due_at) : null,

        meterUnit: textValue(email?.meter_unit) || (planningCurrent ? textValue(plan?.meter_unit) : null),
        currentMeter: effectiveMeter,
        nextDueMeter,
        remainingMeter: effectiveRemaining,
        reportedMpStatus: textValue(email?.reported_mp_status),

        emailReportDate: emailAt,
        emailReportedStatus: textValue(email?.reported_equipment_status),
        emailIssue: textValue(email?.reported_issue),
        emailWork: textValue(email?.reported_work),
        emailPartsRequested: textValue(email?.parts_requested),
        emailReviewStatus: textValue(email?.review_status),

        whatsappOccurredAt: whatsappAt,
        whatsappGroup: textValue(whatsapp?.whatsapp_group),
        whatsappSender: textValue(whatsapp?.sender_name),
        whatsappDescription: textValue(whatsapp?.description),
        whatsappEventClass: textValue(whatsapp?.event_class),

        openWorkOrders: openOrders.length,
        openWorkOrderNumbers: openOrders.map((order) => order.work_order_number),
        latestWorkOrderAt: workOrderAt,

        currentReportedStatus,
        reportedStopped: stopped,
        stoppedSince: stopped ? newest(emailAt, whatsappAt, statusAt) : null,
        partsPending,
        latestSignalAt,
        latestSignalSource,
        latestSignalAgeHours: latestSignalAt
          ? Math.max(0, Math.floor((Date.now() - Date.parse(latestSignalAt)) / 3600000))
          : null,
      };
    });

    rows.sort((a, b) => {
      const score = (row: any) =>
        (row.reportedStopped ? 200 : 0) +
        (row.openWorkOrders > 0 ? 100 : 0) +
        (row.priorityRank === 1 ? 60 : row.priorityRank === 2 ? 30 : 0) +
        (row.partsPending ? 10 : 0);
      const delta = score(b) - score(a);
      if (delta) return delta;
      return String(b.latestSignalAt || '').localeCompare(String(a.latestSignalAt || ''));
    });

    const currentRows = rows.filter((row) => row.currentCoverage);
    const openWorkOrders = workOrders.filter((order) => !isClosed(order.status));
    const completedWorkOrders = workOrders.filter((order) => ['completed', 'closed'].includes(String(order.status).toLowerCase()));
    const today = santiagoDay();
    const tomorrow = santiagoDay(1);
    const overdueOpen = openWorkOrders.filter((order) => order.scheduled_date && String(order.scheduled_date) < today);
    const dueTodayOpen = openWorkOrders.filter((order) => String(order.scheduled_date || '') === today);
    const dueTomorrowOpen = openWorkOrders.filter((order) => String(order.scheduled_date || '') === tomorrow);
    const unassignedOpen = openWorkOrders.filter((order) => !textValue(order.assigned_to_name));
    const inProgressOpen = openWorkOrders.filter((order) => ['in_progress', 'in-progress', 'paused'].includes(String(order.status || '').toLowerCase()));
    const criticalOpen = openWorkOrders.filter((order) => priorityRank(order.priority) === 1);
    const stoppedRows = currentRows.filter((row) => row.reportedStopped);
    const attentionRows = currentRows.filter((row) => row.reportedStopped || row.openWorkOrders > 0 || row.priorityRank <= 2 || row.partsPending);

    const preventiveRows = currentRows.filter((row) => row.nextDueMeter != null || row.reportedMpStatus || row.planningPriority);
    const overduePreventive = preventiveRows.filter((row) =>
      /vencid/i.test(String(row.reportedMpStatus || '')) ||
      (row.remainingMeter != null && row.remainingMeter <= 0)
    );
    const dueSoonPreventive = preventiveRows.filter((row) =>
      /pr[oó]xim/i.test(String(row.reportedMpStatus || ''))
    );
    const dateReviewPreventive = preventiveRows.filter((row) =>
      /revisar fecha/i.test(String(row.reportedMpStatus || ''))
    );
    const stalePlanning = rows.filter((row) => row.planningImportedAt && !row.planningCurrent);

    const assigneeCoordination = [...openWorkOrders.reduce((map, order: any) => {
      const assignee = textValue(order.assigned_to_name) || 'Sin responsable';
      const current = map.get(assignee) || {
        assignee,
        open: 0,
        overdue: 0,
        dueToday: 0,
        dueTomorrow: 0,
        highCritical: 0,
        nextScheduledDate: null as string | null,
      };
      const scheduledDate = textValue(order.scheduled_date);
      current.open += 1;
      if (scheduledDate && scheduledDate < today) current.overdue += 1;
      if (scheduledDate === today) current.dueToday += 1;
      if (scheduledDate === tomorrow) current.dueTomorrow += 1;
      if (priorityRank(order.priority) <= 2) current.highCritical += 1;
      if (scheduledDate && (!current.nextScheduledDate || scheduledDate < current.nextScheduledDate)) current.nextScheduledDate = scheduledDate;
      map.set(assignee, current);
      return map;
    }, new Map<string, any>()).values()]
      .sort((a, b) => b.overdue - a.overdue || b.highCritical - a.highCritical || b.open - a.open);

    const workOrderRows = workOrders.map((order: any) => {
      const asset = rows.find((row) => row.canonicalAssetId === String(order.canonical_asset_id || ''));
      const workOrderId = String(order.id);
      const supply = supplyByWorkOrder.get(workOrderId) || null;
      const requirements = requirementsByWorkOrder.get(workOrderId) || [];
      const stockChecks = requirements.map((requirement: any) => {
        const product = productById.get(String(requirement.canonical_product_id || ''));
        const sku = textValue(product?.product_code);
        const stock = sku ? bodegaBySku.get(sku.trim().toUpperCase()) : null;
        const required = numberValue(requirement.quantity_required) || 0;
        const available = numberValue(stock?.quantity_reported) ?? numberValue(stock?.quantity);
        return {
          canonicalProductId: requirement.canonical_product_id,
          sku,
          productName: textValue(product?.name),
          required,
          available,
          sufficient: available != null ? available >= required : null,
        };
      });
      const stockKnownCount = stockChecks.filter((row: any) => row.available != null).length;
      const stockShortageCount = stockChecks.filter((row: any) => row.sufficient === false).length;
      const evidenceCount = evidenceCountByWorkOrder.get(workOrderId) || 0;
      const supervisorReviewCount = reviewCountByWorkOrder.get(workOrderId) || 0;
      const executionStarted =
        Boolean(order.start_date) ||
        Number(order.total_timer_seconds || 0) > 0 ||
        ['running', 'paused'].includes(String(order.timer_status || '').toLowerCase()) ||
        ['in_progress', 'in-progress', 'paused'].includes(String(order.status || '').toLowerCase());
      const lifecycleStage = isClosed(order.status)
        ? supervisorReviewCount > 0
          ? 'Revisada'
          : evidenceCount > 0
            ? 'Evidenciada'
            : 'Ejecutada'
        : executionStarted
          ? 'En ejecución'
          : textValue(order.assigned_to_name)
            ? 'Asignada'
            : 'Creada';
      const executionReadiness = isClosed(order.status)
        ? 'Cerrada'
        : !textValue(order.assigned_to_name)
          ? 'Sin responsable'
          : requirements.length === 0
            ? 'Materiales no declarados'
            : stockShortageCount > 0 || Number(supply?.material_shortage_count || 0) > 0
              ? 'Bloqueada por faltante'
              : stockKnownCount < requirements.length
                ? 'Stock por confirmar'
                : Number(supply?.open_procurement_request_count || 0) > 0 || Number(supply?.undelivered_order_count || 0) > 0
                  ? 'En compra'
                  : Number(supply?.parts_requested || 0) > 0 &&
                      Number(supply?.parts_issued || 0) >= Number(supply?.parts_requested || 0)
                    ? 'Lista'
                    : Number(supply?.part_line_count || 0) > 0
                      ? 'Reservada · pendiente entrega'
                      : 'Stock informado disponible';
      return {
        id: order.id,
        workOrderNumber: order.work_order_number,
        title: order.title,
        assetName: asset?.assetName || 'Equipo sin vínculo',
        site: asset?.site || textValue(order.workshop_site) || 'Sin faena',
        status: textValue(order.status),
        priority: textValue(order.priority),
        priorityRank: priorityRank(order.priority),
        workType: textValue(order.work_type),
        scheduledDate: textValue(order.scheduled_date),
        startDate: textValue(order.start_date),
        completionDate: textValue(order.completion_date),
        plannedHours: numberValue(order.planned_duration_hours),
        actualHours: numberValue(order.actual_duration_hours),
        downtimeHours: numberValue(order.down_time_hours),
        assignedTo: textValue(order.assigned_to_name),
        timerStatus: textValue(order.timer_status),
        totalTimerMinutes: numberValue(order.total_timer_minutes),
        evidenceCount,
        supervisorReviewCount,
        executionStarted,
        lifecycleStage,
        executionReadiness,
        materialRequirementCount: requirements.length,
        stockKnownCount,
        stockShortageCount,
        stockChecks,
        partsRequested: Number(supply?.parts_requested || 0),
        partsIssued: Number(supply?.parts_issued || 0),
        partsInstalled: Number(supply?.parts_installed || 0),
        supplyStatus: textValue(supply?.supply_chain_status) || 'no_supply_evidence',
        materialRequirements: Number(supply?.material_requirement_count || 0),
        materialShortages: Number(supply?.material_shortage_count || 0),
        openSupplyNeeds: Number(supply?.open_supply_need_count || 0),
        openProcurementRequests: Number(supply?.open_procurement_request_count || 0),
        undeliveredOrders: Number(supply?.undelivered_order_count || 0),
        overdue: !isClosed(order.status) && Boolean(order.scheduled_date) && String(order.scheduled_date) < today,
      };
    });

    const dueTomorrowReadiness = workOrderRows.filter((row: any) => row.scheduledDate === tomorrow && !isClosed(row.status));
    const dueTomorrowNotReady = dueTomorrowReadiness.filter((row: any) => row.executionReadiness !== 'Lista');

    const lifecycleCounts = workOrderRows.reduce((acc: Record<string, number>, row: any) => {
      acc[row.lifecycleStage] = (acc[row.lifecycleStage] || 0) + 1;
      return acc;
    }, {});
    const preventiveBasis = preventiveRows.reduce((acc: { hours: number; km: number; annual: number; other: number }, row: any) => {
      const unit = String(row.meterUnit || '').toLowerCase();
      if (/^h$|hr|hora/.test(unit)) acc.hours += 1;
      else if (/km|kil[oó]m/.test(unit)) acc.km += 1;
      else if (/anual|año|year/.test(unit)) acc.annual += 1;
      else acc.other += 1;
      return acc;
    }, { hours: 0, km: 0, annual: 0, other: 0 });

    const recentSignals = [...rows]
      .filter((row) => row.latestSignalAt)
      .sort((a, b) => String(b.latestSignalAt).localeCompare(String(a.latestSignalAt)))
      .slice(0, 12)
      .map((row) => ({
        canonicalAssetId: row.canonicalAssetId,
        assetName: row.assetName,
        site: row.site,
        source: row.latestSignalSource,
        at: row.latestSignalAt,
        text: row.latestSignalSource === 'email'
          ? row.emailIssue || row.emailWork || row.emailReportedStatus
          : row.latestSignalSource === 'whatsapp'
            ? row.whatsappDescription
            : row.latestSignalSource === 'work_order'
              ? `${row.openWorkOrders} OT abierta(s)`
              : row.canonicalStatusReason || row.recommendedAction || row.planningObservations,
      }));

    const completedPlannedHours = completedWorkOrders.reduce((sum, order) => sum + (numberValue(order.planned_duration_hours) || 0), 0);
    const completedActualHours = completedWorkOrders.reduce((sum, order) => sum + (numberValue(order.actual_duration_hours) || 0), 0);
    const preventiveCompleted = completedWorkOrders.filter((order) => String(order.work_type).toLowerCase() === 'preventive').length;
    const correctiveCompleted = completedWorkOrders.filter((order) => String(order.work_type).toLowerCase() === 'corrective').length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      refreshSeconds: 60,
      rotationSeconds: 30,
      mode: 'read_only',
      operationalCutoff,
      summary: {
        canonicalAssets: rows.length,
        activeAssets: currentRows.length,
        attentionAssets: attentionRows.length,
        stoppedAssets: stoppedRows.length,
        openWorkOrders: openWorkOrders.length,
        completedWorkOrders: completedWorkOrders.length,
        overdueOpenWorkOrders: overdueOpen.length,
        dueTodayOpenWorkOrders: dueTodayOpen.length,
        dueTomorrowOpenWorkOrders: dueTomorrowOpen.length,
        dueTomorrowNotReadyWorkOrders: dueTomorrowNotReady.length,
        unassignedOpenWorkOrders: unassignedOpen.length,
        inProgressOpenWorkOrders: inProgressOpen.length,
        criticalOpenWorkOrders: criticalOpen.length,
        partsPendingAssets: rows.filter((row) => row.partsPending).length,
        p1: rows.filter((row) => row.priorityRank === 1).length,
        p2: rows.filter((row) => row.priorityRank === 2).length,
        preventiveTracked: preventiveRows.length,
        preventiveOverdue: overduePreventive.length,
        preventiveDueSoon: dueSoonPreventive.length,
        preventiveDateReview: dateReviewPreventive.length,
        stalePlanningAssets: stalePlanning.length,
        pendingEmailMatches: (pendingEmailResult.data || []).filter((row: any) => !operationalCutoff || String(row.report_date || '') >= operationalCutoff).length,
        pendingWhatsAppInputs: pendingWhatsappInputs.length,
        linkedEmailAssets: rows.filter((row) => row.emailReportDate).length,
        linkedWhatsAppAssets: rows.filter((row) => row.whatsappOccurredAt).length,
      },
      coordination: {
        role: 'planning_coordination',
        today,
        tomorrow,
        byAssignee: assigneeCoordination,
        blockers: {
          partsPendingAssets: rows.filter((row) => row.partsPending).length,
          openOrdersWithoutSupplyEvidence: openWorkOrders.filter((order: any) => {
            const requirements = requirementsByWorkOrder.get(String(order.id)) || [];
            return requirements.length === 0;
          }).length,
          openOrdersWithShortage: openWorkOrders.filter((order: any) => {
            const supply = supplyByWorkOrder.get(String(order.id));
            return Number(supply?.material_shortage_count || 0) > 0;
          }).length,
          unresolvedEmailInputs: (pendingEmailResult.data || []).filter((row: any) => !operationalCutoff || String(row.report_date || '') >= operationalCutoff).length,
          unresolvedWhatsAppInputs: pendingWhatsappInputs.length,
        },
      },
      lifecycle: {
        counts: lifecycleCounts,
        preventiveBasis,
        approvedPreventiveSchedules: activePreventiveSchedules.length,
        approvedPreventiveSchedulesBasis: activePreventiveSchedules.length
          ? 'Planes preventivos operacionales activos'
          : 'Sin planes preventivos operacionales activos',
      },
      management: {
        plannedHoursCompleted: completedPlannedHours || null,
        actualHoursCompleted: completedActualHours || null,
        preventiveCompleted,
        correctiveCompleted,
        recordedDowntimeHours: workOrders.reduce((sum, order) => sum + (numberValue(order.down_time_hours) || 0), 0) || null,
        availabilityPct: null,
        availabilityBasis: 'Sin base canónica de disponibilidad diaria',
      },
      inventory: {
        source: 'bodega_inventory',
        role: 'advisory_stock_signal',
        reservationSource: 'warehouse_stock',
        latestAt: bodegaLatestAt,
        sourceRows: matchedBodegaRows.length,
        matchedCanonicalSkus: matchedBodegaRows.length,
        conflictedSkus: matchedBodegaRows.length - trustedBodegaRows.length,
        usableStockSkus: trustedBodegaRows.length,
        positiveStockSkus: trustedBodegaRows.filter((row: any) =>
          (numberValue(row.quantity_reported) ?? numberValue(row.quantity) ?? 0) > 0
        ).length,
      },
      freshness: {
        latestEmailAt,
        latestEmailSubject: textValue(latestEmailResult.data?.email_subject),
        latestEmailFilename: textValue(latestEmailResult.data?.filename),
        latestWhatsAppAt,
        latestPublishedWhatsAppAt,
      },
      attentionRows: attentionRows.slice(0, 40),
      stoppedRows: stoppedRows.slice(0, 40),
      preventiveRows: preventiveRows
        .sort((a, b) =>
          preventiveStatusRank(a.reportedMpStatus) - preventiveStatusRank(b.reportedMpStatus) ||
          (a.remainingMeter ?? Number.POSITIVE_INFINITY) - (b.remainingMeter ?? Number.POSITIVE_INFINITY)
        )
        .slice(0, 60),
      workOrders: workOrderRows,
      recentSignals,
      liveInputs: {
        email: {
          latestAt: latestEmailAt,
          subject: textValue(latestEmailResult.data?.email_subject),
          filename: textValue(latestEmailResult.data?.filename),
          ingestState: textValue(latestEmailResult.data?.ingest_state),
        },
        whatsapp: {
          group: 'Grupo 2',
          latestAt: latestWhatsAppAt,
          latestPublishedAt: latestPublishedWhatsappAt,
          pendingCount: pendingWhatsappInputs.length,
          recent: currentWhatsappInputs.slice(0, 6).map((row: any) => ({
            messageId: row.message_id,
            sender: textValue(row.sender_name),
            occurredAt: textValue(row.occurred_at),
            body: textValue(row.body)?.slice(0, 700) || null,
            activityCount: Number(row.activity_count || 0),
            publishedCount: Number(row.published_count || 0),
            registryState: textValue(row.registry_state),
          })),
        },
      },
      rows: currentRows,
      pendingEmail: (pendingEmailResult.data || []).slice(0, 30).map((row: any) => ({
        id: row.id,
        reportDate: textValue(row.report_date),
        assetNameRaw: textValue(row.asset_name_raw),
        site: textValue(row.mine_name),
        reportedStatus: textValue(row.reported_equipment_status),
        issue: textValue(row.reported_issue),
        work: textValue(row.reported_work),
        partsRequested: textValue(row.parts_requested),
        reviewStatus: textValue(row.review_status),
      })),
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar la Torre de Control' },
      { status: 500 },
    );
  }
}
