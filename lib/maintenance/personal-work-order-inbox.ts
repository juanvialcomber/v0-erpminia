import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { isMaintenanceWorkOrderCreatorCargo } from '@/lib/maintenance/work-order-create-access';
import { resolveWorkshopHeadScope, workshopHeadCanAccessOrder } from '@/lib/maintenance/workshop-site-scope';
import { chileTodayDateKey, formatWorkOrderDate, normalizeWorkOrderDateKey } from '@/lib/maintenance/work-order-calendar-date.mjs';

// Personal OT assignments are generated on read from canonical work orders.
// Never create synthetic task records or expose other organizations' assignments.
export type PersonalMaintenanceTask = {
  organization_id: string;
  cargo_id: string;
  cargo_name: string;
  task_key: string;
  domain: 'maintenance';
  severity: 'critical' | 'warning' | 'info';
  priority_score: number;
  title: string;
  evidence_summary: string | null;
  status: string;
  responsibility: 'owner' | 'support';
  role_action: string | null;
  occurred_at: string | null;
  due_at: string | null;
  escalation_at: null;
  age_hours: null;
  urgency_state: 'overdue' | 'due_soon' | 'pending';
};

type Order = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  created_at: string | null;
  created_by: string | null;
  assigned_person_id: string | null;
  assigned_to_name: string | null;
  workshop_site: string | null;
};
type Person = { id: string; full_name: string | null };
const ACTIVE = ['open', 'assigned', 'in_progress', 'pending'];
const ORDER_COLUMNS = 'id,work_order_number,title,status,priority,scheduled_date,created_at,created_by,assigned_person_id,assigned_to_name,workshop_site';

function toInboxTask(
  context: OrganizationSuccessContext,
  cargoId: string,
  cargoName: string,
  order: Order,
  kind: 'execution' | 'followup' | 'approval',
  today: string,
): PersonalMaintenanceTask {
  const dateKey = normalizeWorkOrderDateKey(order.scheduled_date);
  const overdue = kind !== 'approval' && Boolean(dateKey && dateKey < today);
  const todayOrTomorrow = Boolean(dateKey && dateKey >= today && dateKey <= todayPlusOne(today));
  const number = order.work_order_number || 'OT';
  const priority = String(order.priority || '').toLowerCase();
  const severity: PersonalMaintenanceTask['severity'] = priority === 'critical' || (overdue && priority === 'high')
    ? 'critical' : priority === 'high' || overdue || kind === 'approval' ? 'warning' : 'info';
  const scheduled = dateKey ? `Programada: ${formatWorkOrderDate(dateKey)}` : 'Sin fecha de programación';
  const title = kind === 'approval' ? `Aprobar cierre · ${number}`
    : kind === 'execution' ? `${order.status === 'in_progress' ? 'Continuar' : 'Ejecutar'} · ${number}`
    : `Intervenir atraso · ${number}`;
  const evidenceSummary = [
    order.title || 'Orden de mantenimiento',
    kind === 'approval' ? 'Ejecución finalizada; pendiente de aprobación'
      : kind === 'followup' ? `Ejecución vencida · asignada a ${order.assigned_to_name || 'responsable por confirmar'}`
      : 'Asignada a tu usuario',
    scheduled,
  ].join(' · ');
  return {
    organization_id: context.organizationId,
    cargo_id: cargoId,
    cargo_name: cargoName,
    task_key: `work_order:${order.id}`,
    domain: 'maintenance',
    severity,
    priority_score: kind === 'approval' ? 95 : overdue ? 90 : priority === 'critical' ? 88
      : kind === 'execution' ? 78 : 52,
    title: `${title} · ${order.title || 'Trabajo programado'}`,
    evidence_summary: evidenceSummary,
    status: kind === 'approval' ? 'pending' : String(order.status || 'open'),
    responsibility: 'owner',
    role_action: kind === 'approval' ? 'Revisar y aprobar evidencia' : kind === 'execution'
      ? 'Ejecutar trabajo asignado' : 'Reprogramar, destrabar o confirmar nueva fecha con el responsable',
    occurred_at: order.created_at ? `${order.created_at.replace(' ', 'T')}Z` : null,
    due_at: kind === 'approval' || !dateKey ? null : `${dateKey}T23:59:59Z`,
    escalation_at: null,
    age_hours: null,
    urgency_state: overdue ? 'overdue' : todayOrTomorrow || kind === 'approval' ? 'due_soon' : 'pending',
  };
}
function planningExceptionTask(
  context: OrganizationSuccessContext,
  cargoId: string,
  cargoName: string,
  orders: Order[],
  today: string,
): PersonalMaintenanceTask | null {
  const overdue = orders.filter((order) => {
    const dateKey = normalizeWorkOrderDateKey(order.scheduled_date);
    return Boolean(dateKey && dateKey < today && order.status !== 'in_progress');
  });
  if (!overdue.length) return null;

  const earliestDate = overdue
    .map((order) => normalizeWorkOrderDateKey(order.scheduled_date))
    .filter((value): value is string => Boolean(value))
    .sort()[0] || null;
  const assignees = Array.from(new Set(overdue.map((order) => order.assigned_to_name).filter(Boolean))).slice(0, 3);
  const critical = overdue.some((order) => String(order.priority || '').toLowerCase() === 'critical');

  return {
    organization_id: context.organizationId,
    cargo_id: cargoId,
    cargo_name: cargoName,
    task_key: 'maintenance_planning:overdue_not_started',
    domain: 'maintenance',
    severity: critical ? 'warning' : 'info',
    priority_score: critical ? 78 : 58,
    title: `${overdue.length} OT planificada${overdue.length === 1 ? '' : 's'} pendiente${overdue.length === 1 ? '' : 's'}`,
    evidence_summary: [
      `${overdue.length} OT siguen abiertas después de su fecha planificada`,
      assignees.length ? `Responsables: ${assignees.join(', ')}` : null,
      'Siguen siendo trabajo planificado; revisar vigencia de fecha y reprogramar sólo si corresponde',
    ].filter(Boolean).join(' · '),
    status: 'pending',
    responsibility: 'owner',
    role_action: 'Revisar vigencia del plan y reprogramar sólo si la fecha ya no corresponde',
    occurred_at: overdue.map((order) => order.created_at).filter(Boolean).sort()[0] || null,
    due_at: earliestDate ? `${earliestDate}T23:59:59Z` : null,
    escalation_at: null,
    age_hours: null,
    urgency_state: 'overdue',
  };
}

function todayPlusOne(today: string) {
  const date = new Date(`${today}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function loadPersonalMaintenanceTasks(
  context: OrganizationSuccessContext,
  cargoId: string,
  cargoName: string,
): Promise<PersonalMaintenanceTask[]> {
  const { data: person, error: personError } = await context.supabase.from('people')
    .select('id,full_name')
    .eq('organization_id', context.organizationId)
    .eq('profile_id', context.userId)
    .eq('employment_status', 'active')
    .maybeSingle();
  if (personError) throw personError;

  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const workshop = await resolveWorkshopHeadScope(context);
  const canFollowup = accessLevel === 'ED' && isMaintenanceWorkOrderCreatorCargo(cargoName);
  // Production review endpoint allows precisely these active reviewers, not all technicians with ED.
  const canApprove = accessLevel === 'ED' && ['Ariel López', 'Mauricio Astudillo'].includes(
    String((person as Person | null)?.full_name || ''),
  );

  if (!person?.id && !canFollowup && !canApprove) return [];
  const emptyResult: { data: Order[]; error: null } = { data: [], error: null };

  const [assignedResult, createdResult, completedResult] = await Promise.all([
    person?.id ? context.supabase.from('maintenance_work_orders')
      .select(ORDER_COLUMNS)
      .eq('organization_id', context.organizationId)
      .eq('assigned_person_id', person.id)
      .not('created_by', 'is', null)
      .in('status', ACTIVE)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(200) : Promise.resolve(emptyResult),
    canFollowup ? context.supabase.from('maintenance_work_orders')
      .select(ORDER_COLUMNS)
      .eq('organization_id', context.organizationId)
      .eq('created_by', context.authUserId || context.userId)
      .in('status', ACTIVE)
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(200) : Promise.resolve(emptyResult),
    canApprove ? context.supabase.from('maintenance_work_orders')
      .select(ORDER_COLUMNS)
      .eq('organization_id', context.organizationId)
      .not('created_by', 'is', null)
      .eq('status', 'completed')
      .order('closed_at', { ascending: false, nullsFirst: false })
      .limit(100) : Promise.resolve(emptyResult),
  ]);
  if (assignedResult.error || createdResult.error || completedResult.error) {
    throw assignedResult.error || createdResult.error || completedResult.error;
  }

  const visible = (order: Order) => workshopHeadCanAccessOrder(workshop, order);
  const assigned = ((assignedResult.data || []) as Order[]).filter(visible);
  const created = ((createdResult.data || []) as Order[]).filter(visible);
  const closed = ((completedResult.data || []) as Order[]).filter(visible);
  const reviewed = new Set<string>();
  if (closed.length) {
    const { data: reviews, error: reviewError } = await context.supabase
      .from('work_order_supervisor_reviews')
      .select('work_order_id,status')
      .eq('organization_id', context.organizationId)
      .in('work_order_id', closed.map((order) => order.id));
    if (reviewError) throw reviewError;
    for (const review of reviews || []) if (review.status === 'approved') reviewed.add(review.work_order_id);
  }

  const now = chileTodayDateKey();
  const tasks = new Map<string, PersonalMaintenanceTask>();

  // Planning ownership is not the same as personal execution.
  // Created OTs stay in the weekly plan unless they become a real exception.
  const overdueInProgress = created.filter((order) => {
    const dateKey = normalizeWorkOrderDateKey(order.scheduled_date);
    return order.status === 'in_progress' && Boolean(dateKey && dateKey < now);
  });
  for (const order of overdueInProgress) {
    tasks.set(order.id, toInboxTask(context, cargoId, cargoName, order, 'followup', now));
  }

  const planningException = planningExceptionTask(context, cargoId, cargoName, created, now);
  if (planningException) tasks.set(planningException.task_key, planningException);

  // A person's own assignment takes precedence over planning/follow-up signals.
  for (const order of assigned) {
    tasks.set(order.id, toInboxTask(context, cargoId, cargoName, order, 'execution', now));
  }
  for (const order of closed) {
    if (!reviewed.has(order.id)) {
      tasks.set(order.id, toInboxTask(context, cargoId, cargoName, order, 'approval', now));
    }
  }
  return [...tasks.values()];
}
