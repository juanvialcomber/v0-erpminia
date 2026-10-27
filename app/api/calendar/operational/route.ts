export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getUserModuleAccess, isAdminRole, MODULE_KEYS } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';

type CalendarSource = 'maintenance' | 'hse' | 'legal' | 'procurement' | 'finance' | 'people';
type CalendarPriority = 'critical' | 'high' | 'medium' | 'low';
type CalendarScope = 'active' | 'historical' | 'all';

type OperationalCalendarItem = {
  id: string;
  source: CalendarSource;
  source_label: string;
  kind: string;
  date: string;
  title: string;
  subtitle: string | null;
  reference: string | null;
  status: string;
  status_label: string;
  priority: CalendarPriority;
  priority_label: string;
  owner: string | null;
  location: string | null;
  href: string;
  historical: boolean;
  completed_at: string | null;
  image_urls?: string[];
  asset_name?: string | null;
  asset_code?: string | null;
  asset_cost_center?: string | null;
  overdue: boolean;
  days_until: number;
  created_by_me?: boolean;
  actionable_for_me?: boolean;
  action_label?: string | null;
  action_note?: string | null;
};

const CLOSED_STATUSES = new Set([
  'completed',
  'closed',
  'cancelled',
  'canceled',
  'received',
  'void',
  'voided',
  'completada',
  'cerrada',
  'realizada',
  'cancelada',
  'reconciled',
  'paid',
  'pagado',
]);

const PRIORITY_RANK: Record<CalendarPriority, number> = {
  critical: 0,
  high: 1,
  medium: 2,
  low: 3,
};

function localDateKey() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Santiago',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function differenceInDays(dateKey: string, comparisonKey: string) {
  const date = new Date(`${dateKey}T12:00:00Z`).getTime();
  const comparison = new Date(`${comparisonKey}T12:00:00Z`).getTime();
  return Math.round((date - comparison) / 86_400_000);
}

function normalizeText(value: unknown) {
  const text = String(value ?? '').trim();
  return text || null;
}

function normalizeDate(value: unknown) {
  const text = normalizeText(value);
  return text ? text.slice(0, 10) : null;
}

function normalizePriority(value: unknown): CalendarPriority {
  const priority = String(value ?? '').trim().toLowerCase();
  if (['critica', 'crítica', 'critical', 'urgente', 'urgent'].includes(priority)) return 'critical';
  if (['alta', 'high'].includes(priority)) return 'high';
  if (['baja', 'low'].includes(priority)) return 'low';
  return 'medium';
}

function priorityLabel(priority: CalendarPriority) {
  if (priority === 'critical') return 'Crítica';
  if (priority === 'high') return 'Alta';
  if (priority === 'low') return 'Baja';
  return 'Media';
}

function statusLabel(value: unknown) {
  const status = String(value ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    pending: 'Pendiente',
    planned: 'Planificado',
    open: 'Abierto',
    in_progress: 'En curso',
    new: 'Nuevo',
    in_review: 'En revisión',
    action_required: 'Acción requerida',
    waiting_area: 'Esperando área',
    draft: 'Borrador',
    approved: 'Aprobado',
    issued: 'Emitida',
    partially_received: 'Recepción parcial',
    awaiting_quote: 'Esperando cotización',
    awaiting_award: 'Esperando adjudicación',
    awaiting_receipt: 'Esperando recepción',
    vigente: 'Vigente',
    programado: 'Programado',
    completed: 'Completada',
    closed: 'Cerrada',
    received: 'Recibida',
    cancelled: 'Cancelada',
    canceled: 'Cancelada',
    void: 'Anulada',
    voided: 'Anulada',
  };
  return labels[status] || (status ? status.replaceAll('_', ' ') : 'Pendiente');
}

function isHistoricalStatus(value: unknown) {
  return CLOSED_STATUSES.has(String(value ?? '').trim().toLowerCase());
}

function includeForScope(status: unknown, scope: CalendarScope) {
  const historical = isHistoricalStatus(status);
  if (scope === 'historical') return historical;
  if (scope === 'active') return !historical;
  return true;
}

function complianceKind(value: unknown) {
  const eventType = String(value ?? '').trim().toLowerCase();
  const labels: Record<string, string> = {
    inspection: 'Inspección',
    training: 'Capacitación',
    audit: 'Auditoría',
    monitoring: 'Monitoreo',
    legal: 'Vencimiento legal',
    meeting: 'Reunión',
    report: 'Informe',
  };
  return labels[eventType] || 'Cumplimiento';
}

function complianceSource(value: unknown): CalendarSource {
  const eventType = String(value ?? '').trim().toLowerCase();
  return eventType === 'legal' ? 'legal' : 'hse';
}

function complianceSourceLabel(value: unknown) {
  return complianceSource(value) === 'legal' ? 'Legal' : 'HSE';
}

function complianceHref(value: unknown) {
  const eventType = String(value ?? '').trim().toLowerCase();
  if (eventType === 'training') return '/dashboard/sostenibilidad/prevencion-riesgos/capacitaciones';
  if (eventType === 'inspection' || eventType === 'audit') {
    return '/dashboard/sostenibilidad/prevencion-riesgos/inspecciones';
  }
  if (eventType === 'monitoring') return '/dashboard/sostenibilidad/medio-ambiente';
  if (eventType === 'legal') return '/dashboard/legal';
  return '/dashboard/sostenibilidad';
}

function buildItem(
  item: Omit<OperationalCalendarItem, 'overdue' | 'days_until' | 'priority_label'>,
  today: string,
): OperationalCalendarItem {
  const daysUntil = differenceInDays(item.date, today);
  return {
    ...item,
    priority_label: priorityLabel(item.priority),
    overdue: !item.historical && daysUntil < 0,
    days_until: daysUntil,
  };
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const searchParams = new URL(request.url).searchParams;
  const requestedDays = Number(searchParams.get('days') || 60);
  const requestedScope = searchParams.get('scope');
  const scope: CalendarScope = requestedScope === 'historical' || requestedScope === 'all'
    ? requestedScope
    : 'active';
  const days = Math.min(Math.max(Number.isFinite(requestedDays) ? Math.trunc(requestedDays) : 60, 7), 120);
  const today = localDateKey();
  const startDate = addDays(today, scope === 'active' ? -30 : -365);
  const endDate = scope === 'historical' ? today : addDays(today, days);

  try {
    const creationCapability = await getMaintenanceWorkOrderCreationCapability(context);
    const canApproveMaintenance = creationCapability.accessLevel === 'ED' && ['Ariel López', 'Mauricio Astudillo'].includes(String(creationCapability.personName || ''));
    const [workOrdersResult, preventiveResult, complianceResult, requestsResult, ordersResult, internalInspectionsResult, externalInspectionsResult, payablesResult, credentialsResult, legalCasesResult, approvalCandidatesResult] = await Promise.all([
      context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,title,description,status,priority,work_type,scheduled_date,completion_date,closed_at,assigned_to_name,assigned_person_id,cost_center_id,canonical_asset_id,created_by')
        .eq('organization_id', context.organizationId)
        .not('scheduled_date', 'is', null)
        .gte('scheduled_date', startDate)
        .lte('scheduled_date', endDate)
        .limit(1000),
      context.supabase
        .from('preventive_maintenance_schedules')
        .select('id,task_name,description,next_scheduled_date,priority,enabled,generated_work_order_id,canonical_asset_id,asset_id')
        .eq('organization_id', context.organizationId)
        .not('next_scheduled_date', 'is', null)
        .gte('next_scheduled_date', startDate)
        .lte('next_scheduled_date', endDate)
        .or('enabled.eq.true,enabled.is.null')
        .is('generated_work_order_id', null)
        .limit(500),
      context.supabase
        .from('compliance_events')
        .select('id,title,description,event_type,due_date,status,priority,responsible_person_name,location')
        .eq('org_id', context.organizationId)
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .limit(1000),
      context.supabase
        .from('procurement_intake_requests')
        .select('id,request_number,justification,status,priority,required_date,requested_by_name')
        .eq('organization_id', context.organizationId)
        .not('required_date', 'is', null)
        .gte('required_date', startDate)
        .lte('required_date', endDate)
        .limit(1000),
      context.supabase
        .from('procurement_operational_orders')
        .select('id,intake_request_id,order_number,status,expected_delivery_date,actual_delivery_date')
        .eq('organization_id', context.organizationId)
        .not('expected_delivery_date', 'is', null)
        .gte('expected_delivery_date', startDate)
        .lte('expected_delivery_date', endDate)
        .limit(1000),
      context.supabase
        .from('inspecciones_internas')
        .select('id,numero_inspeccion,fecha_planificada,fecha_realizada,faena,inspector,estado')
        .eq('organization_id', context.organizationId)
        .not('fecha_planificada', 'is', null)
        .gte('fecha_planificada', startDate)
        .lte('fecha_planificada', endDate)
        .limit(500),
      context.supabase
        .from('inspecciones_externas')
        .select('id,numero_inspeccion,fecha_planificada,fecha_realizada,faena,inspector,estado,empresa_externa')
        .eq('organization_id', context.organizationId)
        .not('fecha_planificada', 'is', null)
        .gte('fecha_planificada', startDate)
        .lte('fecha_planificada', endDate)
        .limit(500),
      context.supabase
        .from('procurement_accounts_payable')
        .select('id,invoice_id,supplier_id,currency,approved_amount,due_date,status')
        .eq('organization_id', context.organizationId)
        .not('due_date', 'is', null)
        .gte('due_date', startDate)
        .lte('due_date', endDate)
        .limit(1000),
      context.supabase
        .from('person_credentials')
        .select('id,person_id,credential_type,credential_name,credential_number,expires_at,status')
        .eq('organization_id', context.organizationId)
        .not('expires_at', 'is', null)
        .gte('expires_at', startDate)
        .lte('expires_at', endDate)
        .limit(1000),
      context.supabase
        .from('legal_cases')
        .select('id,source_type,source_id,title,reason,priority,operational_owner,legal_owner,due_at,status,closed_at')
        .eq('organization_id', context.organizationId)
        .not('due_at', 'is', null)
        .gte('due_at', startDate)
        .lte('due_at', endDate)
        .limit(1000),
      canApproveMaintenance ? context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,title,description,priority,closed_at,completion_date,assigned_to_name,canonical_asset_id')
        .eq('organization_id', context.organizationId)
        .eq('status', 'completed')
        .order('closed_at', { ascending: false, nullsFirst: false })
        .limit(100) : Promise.resolve({ data: [], error: null }),
    ]);

    const warnings: string[] = [];
    if (workOrdersResult.error) warnings.push('No se pudieron cargar las órdenes de trabajo.');
    if (preventiveResult.error) warnings.push('No se pudo cargar la planificación preventiva.');
    if (complianceResult.error) warnings.push('No se pudieron cargar los compromisos de cumplimiento.');
    if (requestsResult.error) warnings.push('No se pudieron cargar los requerimientos de compra.');
    if (ordersResult.error) warnings.push('No se pudieron cargar las entregas de órdenes de compra.');
    if (internalInspectionsResult.error) warnings.push('No se pudieron cargar las inspecciones HSE internas.');
    if (externalInspectionsResult.error) warnings.push('No se pudieron cargar las inspecciones HSE externas.');
    if (payablesResult.error) warnings.push('No se pudieron cargar los vencimientos financieros.');
    if (credentialsResult.error) warnings.push('No se pudieron cargar los vencimientos de credenciales de Personas.');
    if (legalCasesResult.error) warnings.push('No se pudieron cargar los casos legales con plazo.');
    if (approvalCandidatesResult.error) warnings.push('No se pudieron cargar los cierres pendientes de revisión.');

    // Resolve evidence only for orders already scoped to the viewer's organization.
    const orderIds = (workOrdersResult.data || []).map((order) => order.id);
    const evidenceImages = new Map<string, string[]>();
    const assetIds = Array.from(new Set((workOrdersResult.data || []).map(order => order.canonical_asset_id).filter((id): id is string => Boolean(id))));
    const assetsById = new Map<string, { name: string | null; asset_code: string | null; cost_center_code: string | null }>();
    if (assetIds.length) {
      const { data: assets, error: assetError } = await context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,name,asset_code,cost_center_code')
        .eq('organization_id', context.organizationId)
        .in('id', assetIds);
      if (assetError) warnings.push('No se pudo cargar el contexto de activos.');
      for (const asset of assets || []) assetsById.set(asset.id, asset);
    }
    if (orderIds.length) {
      const { data: evidenceRows, error: evidenceError } = await context.supabase
        .from('work_order_evidence_files')
        .select('work_order_id,storage_bucket,storage_path,mime_type,captured_at')
        .eq('organization_id', context.organizationId)
        .in('work_order_id', orderIds)
        .like('mime_type', 'image/%')
        .order('captured_at', { ascending: false })
        .limit(2000);
      if (evidenceError) {
        warnings.push('No se pudieron cargar las fotografías de las OT.');
      } else {
        const candidates = new Map<string, Array<{ bucket: string; path: string }>>();
        for (const row of evidenceRows || []) {
          if (!row.storage_bucket || !row.storage_path) continue;
          const existing = candidates.get(row.work_order_id) || [];
          if (existing.length < 20) existing.push({ bucket: row.storage_bucket, path: row.storage_path });
          candidates.set(row.work_order_id, existing);
        }
        await Promise.all(Array.from(candidates, async ([orderId, images]) => {
          const signed = await Promise.all(images.map(({ bucket, path }) =>
            context.supabase.storage.from(bucket).createSignedUrl(path, 3600)
          ));
          const urls = signed.map(({ data }) => data?.signedUrl).filter((url): url is string => Boolean(url));
          if (urls.length) evidenceImages.set(orderId, urls);
        }));
      }
    }

    const items: OperationalCalendarItem[] = [];

    for (const row of workOrdersResult.data || []) {
      if (!row.scheduled_date || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      const isEmergency = String(row.work_type || '').toLowerCase() === 'emergency';
      const priority = isEmergency ? 'critical' : normalizePriority(row.priority);
      items.push(buildItem({
        id: `work-order:${row.id}`,
        source: 'maintenance',
        source_label: 'Mantenimiento',
        kind: isEmergency ? 'OTe · Emergencia' : 'Orden de trabajo',
        date: row.scheduled_date,
        title: row.title,
        subtitle: normalizeText(row.description),
        reference: normalizeText(row.work_order_number),
        status: normalizeText(row.status) || 'pending',
        status_label: statusLabel(row.status),
        priority,
        owner: normalizeText(row.assigned_to_name),
        location: null,
        href: `/dashboard/mantenimiento/ordenes-trabajo/${row.id}`,
        historical,
        completed_at: normalizeDate(row.completion_date || row.closed_at),
        image_urls: evidenceImages.get(row.id) || [],
        asset_name: row.canonical_asset_id ? assetsById.get(row.canonical_asset_id)?.name || null : null,
        asset_code: row.canonical_asset_id ? assetsById.get(row.canonical_asset_id)?.asset_code || null : null,
        asset_cost_center: row.canonical_asset_id ? assetsById.get(row.canonical_asset_id)?.cost_center_code || null : null,
        created_by_me: Boolean(row.created_by && row.created_by === context.userId),
        actionable_for_me: Boolean(row.created_by && row.created_by === context.userId),
        action_label: row.created_by && row.created_by === context.userId
          ? !row.assigned_person_id ? 'Asignar responsable'
            : !row.cost_center_id ? 'Completar centro de costo'
              : isEmergency ? 'Supervisar OTe' : 'Supervisar OT'
          : null,
        action_note: row.created_by && row.created_by === context.userId
          ? !row.assigned_person_id ? 'Esta OT todavía no tiene responsable.'
            : !row.cost_center_id ? 'Falta centro de costo antes de dejarla lista para ejecutar.'
              : isEmergency ? 'OTe de emergencia registrada por ti.' : 'OT programada por ti.'
          : null,
      }, today));
    }

    if (scope !== 'historical') {
      for (const row of preventiveResult.data || []) {
        if (!row.next_scheduled_date) continue;
        const priority = normalizePriority(row.priority);
        items.push(buildItem({
          id: `preventive:${row.id}`,
          source: 'maintenance',
          source_label: 'Mantenimiento',
          kind: 'Plan preventivo',
          date: row.next_scheduled_date,
          title: row.task_name,
          subtitle: normalizeText(row.description),
          reference: null,
          status: 'planned',
          status_label: 'Planificado',
          priority,
          owner: null,
          location: null,
          href: `/dashboard/mantenimiento/ordenes-trabajo/create?${new URLSearchParams({
            ...(row.canonical_asset_id || row.asset_id ? { assetId: String(row.canonical_asset_id || row.asset_id) } : {}),
            title: String(row.task_name || ''),
            scheduledDate: String(row.next_scheduled_date || ''),
            workType: 'preventive',
          }).toString()}`,
          historical: false,
          completed_at: null,
          actionable_for_me: creationCapability.canCreate,
          action_label: creationCapability.canCreate ? 'Programar OT' : null,
          action_note: creationCapability.canCreate ? 'Plan preventivo todavía sin OT.' : null,
        }, today));
      }
    }

    if (canApproveMaintenance && !approvalCandidatesResult.error) {
      const candidateIds = (approvalCandidatesResult.data || []).map((row) => row.id);
      const approvedIds = new Set<string>();
      if (candidateIds.length) {
        const { data: reviewRows, error: reviewError } = await context.supabase
          .from('work_order_supervisor_reviews')
          .select('work_order_id,status')
          .eq('organization_id', context.organizationId)
          .in('work_order_id', candidateIds);
        if (reviewError) warnings.push('No se pudo verificar qué cierres ya fueron aprobados.');
        for (const review of reviewRows || []) if (review.status === 'approved') approvedIds.add(review.work_order_id);
      }
      for (const row of approvalCandidatesResult.data || []) {
        if (approvedIds.has(row.id)) continue;
        const priority = normalizePriority(row.priority);
        items.push(buildItem({
          id: `maintenance-approval:${row.id}`,
          source: 'maintenance',
          source_label: 'Mantenimiento',
          kind: 'Revisar cierre',
          date: today,
          title: `Revisar cierre · ${row.work_order_number || 'OT'}`,
          subtitle: normalizeText(row.title || row.description),
          reference: normalizeText(row.work_order_number),
          status: 'action_required',
          status_label: 'Revisar hoy',
          priority,
          owner: creationCapability.personName,
          location: null,
          href: `/dashboard/mantenimiento/ordenes-trabajo/${row.id}`,
          historical: false,
          completed_at: null,
          actionable_for_me: true,
          action_label: 'Revisar cierre',
          action_note: 'La ejecución terminó y falta tu revisión.',
        }, today));
      }
    }


    for (const row of complianceResult.data || []) {
      if (!row.due_date || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      const priority = normalizePriority(row.priority);
      items.push(buildItem({
        id: `compliance:${row.id}`,
        source: complianceSource(row.event_type),
        source_label: complianceSourceLabel(row.event_type),
        kind: complianceKind(row.event_type),
        date: row.due_date,
        title: row.title,
        subtitle: normalizeText(row.description),
        reference: null,
        status: normalizeText(row.status) || 'pending',
        status_label: statusLabel(row.status),
        priority,
        owner: normalizeText(row.responsible_person_name),
        location: normalizeText(row.location),
        href: complianceHref(row.event_type),
        historical,
        completed_at: null,
      }, today));
    }


    for (const row of legalCasesResult.data || []) {
      if (!row.due_at || row.source_type === 'compliance_event' || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      items.push(buildItem({
        id: `legal-case:${row.id}`,
        source: 'legal',
        source_label: 'Legal',
        kind: row.source_type === 'contract_review'
          ? 'Revisión contractual'
          : row.source_type === 'contract_expiry'
            ? 'Vencimiento contractual'
            : 'Caso legal',
        date: row.due_at,
        title: row.title,
        subtitle: normalizeText(row.reason),
        reference: normalizeText(row.source_type),
        status: normalizeText(row.status) || 'new',
        status_label: statusLabel(row.status),
        priority: normalizePriority(row.priority),
        owner: normalizeText(row.legal_owner || row.operational_owner),
        location: null,
        href: '/dashboard/legal/casos',
        historical,
        completed_at: normalizeDate(row.closed_at),
      }, today));
    }


    for (const row of internalInspectionsResult.data || []) {
      if (!row.fecha_planificada || !includeForScope(row.estado, scope)) continue;
      const historical = isHistoricalStatus(row.estado);
      items.push(buildItem({
        id: `hse-internal-inspection:${row.id}`,
        source: 'hse',
        source_label: 'HSE',
        kind: 'Inspección interna',
        date: row.fecha_planificada,
        title: `Inspección ${row.numero_inspeccion}`,
        subtitle: normalizeText(row.faena),
        reference: normalizeText(row.numero_inspeccion),
        status: normalizeText(row.estado) || 'planned',
        status_label: statusLabel(row.estado),
        priority: 'medium',
        owner: normalizeText(row.inspector),
        location: normalizeText(row.faena),
        href: '/dashboard/sostenibilidad/prevencion-riesgos/inspecciones',
        historical,
        completed_at: normalizeDate(row.fecha_realizada),
      }, today));
    }

    for (const row of externalInspectionsResult.data || []) {
      if (!row.fecha_planificada || !includeForScope(row.estado, scope)) continue;
      const historical = isHistoricalStatus(row.estado);
      items.push(buildItem({
        id: `hse-external-inspection:${row.id}`,
        source: 'hse',
        source_label: 'HSE',
        kind: 'Inspección externa',
        date: row.fecha_planificada,
        title: `Inspección ${row.numero_inspeccion}`,
        subtitle: normalizeText(row.empresa_externa || row.faena),
        reference: normalizeText(row.numero_inspeccion),
        status: normalizeText(row.estado) || 'planned',
        status_label: statusLabel(row.estado),
        priority: 'high',
        owner: normalizeText(row.inspector),
        location: normalizeText(row.faena),
        href: '/dashboard/sostenibilidad/prevencion-riesgos/inspecciones',
        historical,
        completed_at: normalizeDate(row.fecha_realizada),
      }, today));
    }



    const credentialPersonIds = Array.from(new Set((credentialsResult.data || []).map((row) => row.person_id).filter(Boolean)));
    const { data: credentialPeople, error: credentialPeopleError } = credentialPersonIds.length
      ? await context.supabase
          .from('people')
          .select('id,full_name')
          .eq('organization_id', context.organizationId)
          .in('id', credentialPersonIds)
      : { data: [], error: null };
    if (credentialPeopleError) warnings.push('No se pudieron resolver las personas de las credenciales.');
    const credentialPersonById = new Map((credentialPeople || []).map((row) => [row.id, row.full_name]));

    for (const row of credentialsResult.data || []) {
      if (!row.expires_at || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      const daysUntil = differenceInDays(row.expires_at, today);
      const priority: CalendarPriority = daysUntil < 0 ? 'critical' : daysUntil <= 30 ? 'high' : 'medium';
      const personName = row.person_id ? credentialPersonById.get(row.person_id) : null;

      items.push(buildItem({
        id: `people-credential:${row.id}`,
        source: 'people',
        source_label: 'Personas',
        kind: 'Vencimiento de credencial',
        date: row.expires_at,
        title: row.credential_name ? `Vence ${row.credential_name}` : 'Vence credencial',
        subtitle: normalizeText(row.credential_type),
        reference: normalizeText(row.credential_number),
        status: normalizeText(row.status) || 'vigente',
        status_label: statusLabel(row.status),
        priority,
        owner: normalizeText(personName),
        location: null,
        href: row.person_id ? `/dashboard/rrhh/personas/${row.person_id}` : '/dashboard/rrhh',
        historical,
        completed_at: null,
      }, today));
    }

    const payableInvoiceIds = (payablesResult.data || []).map((row) => row.invoice_id).filter(Boolean);
    const { data: payableInvoices, error: payableInvoicesError } = payableInvoiceIds.length
      ? await context.supabase
          .from('procurement_supplier_invoices')
          .select('id,invoice_number,supplier_id')
          .eq('organization_id', context.organizationId)
          .in('id', payableInvoiceIds)
      : { data: [], error: null };
    if (payableInvoicesError) warnings.push('No se pudieron resolver las facturas de Tesorería.');

    const payableSupplierIds = Array.from(new Set((payablesResult.data || []).map((row) => row.supplier_id).filter(Boolean)));
    const { data: payableSuppliers, error: payableSuppliersError } = payableSupplierIds.length
      ? await context.supabase
          .from('canonical_suppliers_v1')
          .select('id,legal_name,trade_name')
          .eq('organization_id', context.organizationId)
          .in('id', payableSupplierIds)
      : { data: [], error: null };
    if (payableSuppliersError) warnings.push('No se pudieron resolver los proveedores de Tesorería.');

    const payableInvoiceById = new Map((payableInvoices || []).map((row) => [row.id, row]));
    const payableSupplierById = new Map((payableSuppliers || []).map((row) => [row.id, row]));

    for (const row of payablesResult.data || []) {
      if (!row.due_date || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      const invoice = row.invoice_id ? payableInvoiceById.get(row.invoice_id) : null;
      const supplier = row.supplier_id ? payableSupplierById.get(row.supplier_id) : null;
      const daysUntil = differenceInDays(row.due_date, today);
      const priority: CalendarPriority = daysUntil < 0 ? 'critical' : daysUntil <= 7 ? 'high' : 'medium';

      items.push(buildItem({
        id: `finance-payable:${row.id}`,
        source: 'finance',
        source_label: 'Finanzas',
        kind: 'Vencimiento de pago',
        date: row.due_date,
        title: invoice?.invoice_number ? `Pagar factura ${invoice.invoice_number}` : 'Obligación por pagar',
        subtitle: normalizeText(supplier?.trade_name || supplier?.legal_name),
        reference: normalizeText(invoice?.invoice_number),
        status: normalizeText(row.status) || 'pending',
        status_label: statusLabel(row.status),
        priority,
        owner: null,
        location: null,
        href: '/dashboard/finanzas/pagos',
        historical,
        completed_at: null,
      }, today));
    }

    const orderedRequestIds = new Set(
      (ordersResult.data || []).map((row) => row.intake_request_id).filter(Boolean),
    );

    for (const row of requestsResult.data || []) {
      if (!row.required_date || !includeForScope(row.status, scope) || orderedRequestIds.has(row.id)) continue;
      const historical = isHistoricalStatus(row.status);
      const priority = normalizePriority(row.priority);
      items.push(buildItem({
        id: `purchase-request:${row.id}`,
        source: 'procurement',
        source_label: 'Abastecimiento',
        kind: 'Requerimiento',
        date: row.required_date,
        title: `Atender requerimiento ${row.request_number}`,
        subtitle: normalizeText(row.justification),
        reference: normalizeText(row.request_number),
        status: normalizeText(row.status) || 'pending',
        status_label: statusLabel(row.status),
        priority,
        owner: normalizeText(row.requested_by_name),
        location: null,
        href: '/dashboard/compras',
        historical,
        completed_at: null,
      }, today));
    }

    for (const row of ordersResult.data || []) {
      if (!row.expected_delivery_date || !includeForScope(row.status, scope)) continue;
      const historical = isHistoricalStatus(row.status);
      const priority: CalendarPriority = row.status === 'partially_received' ? 'high' : 'medium';
      items.push(buildItem({
        id: `purchase-order:${row.id}`,
        source: 'procurement',
        source_label: 'Abastecimiento',
        kind: 'Entrega OC',
        date: row.expected_delivery_date,
        title: `Recepción esperada ${row.order_number}`,
        subtitle: null,
        reference: normalizeText(row.order_number),
        status: normalizeText(row.status) || 'issued',
        status_label: statusLabel(row.status),
        priority,
        owner: null,
        location: null,
        href: '/dashboard/compras',
        historical,
        completed_at: normalizeDate(row.actual_delivery_date),
      }, today));
    }

    const access = isAdminRole(context.role) ? null : (await getUserModuleAccess(context.userId)).access;
    const allowed = (key: string) => access === null || access[key] === 'ED' || access[key] === 'LEC';
    const allowedSources: Record<CalendarSource, boolean> = {
      maintenance: allowed(MODULE_KEYS.MANT_OPERACIONES),
      hse: allowed(MODULE_KEYS.HSE_TABLERO) || allowed(MODULE_KEYS.SOS_CALENDARIO),
      legal: allowed(MODULE_KEYS.LEGAL_MODULO),
      procurement: allowed(MODULE_KEYS.FIN_COMPRAS),
      finance: allowed(MODULE_KEYS.FIN_FINANZAS),
      people: allowed(MODULE_KEYS.CORE_DESEMPENO),
    };
    const visibleItems = items.filter(item => allowedSources[item.source]);
    visibleItems.sort((a, b) => {
      const byDate = scope === 'historical'
        ? b.date.localeCompare(a.date)
        : a.date.localeCompare(b.date);
      if (byDate !== 0) return byDate;
      const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (byPriority !== 0) return byPriority;
      return a.title.localeCompare(b.title, 'es');
    });

    const activeItems = visibleItems.filter((item) => !item.historical);
    const summary = {
      overdue: activeItems.filter((item) => item.days_until < 0).length,
      today: activeItems.filter((item) => item.days_until === 0).length,
      next_7_days: activeItems.filter((item) => item.days_until > 0 && item.days_until <= 7).length,
      total: visibleItems.length,
      historical: visibleItems.filter((item) => item.historical).length,
      by_source: {
        maintenance: visibleItems.filter((item) => item.source === 'maintenance').length,
        hse: items.filter((item) => item.source === 'hse').length,
        legal: items.filter((item) => item.source === 'legal').length,
        procurement: items.filter((item) => item.source === 'procurement').length,
        finance: items.filter((item) => item.source === 'finance').length,
        people: items.filter((item) => item.source === 'people').length,
      },
    };

    const { data: calendarProfile } = await context.supabase.from('profiles').select('full_name').eq('id', context.userId).eq('organization_id', context.organizationId).maybeSingle();
    return NextResponse.json({
      viewerName: calendarProfile?.full_name || null,
      data: visibleItems,
      allowedSources,
      summary,
      warnings,
      range: {
        today,
        start_date: startDate,
        end_date: endDate,
        future_days: days,
        scope,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el calendario operativo';
    return NextResponse.json({ error: message, data: [] }, { status: 500 });
  }
}
