export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { loadPersonalMaintenanceTasks } from '@/lib/maintenance/personal-work-order-inbox';

type RoleTask = {
  organization_id: string;
  cargo_id: string;
  cargo_name: string;
  task_key: string;
  domain: string;
  severity: 'critical' | 'warning' | 'info';
  priority_score: number;
  title: string;
  evidence_summary: string | null;
  status: string;
  responsibility: 'owner' | 'support' | 'escalation';
  role_action: string | null;
  occurred_at: string | null;
  due_at: string | null;
  escalation_at: string | null;
  age_hours: number | null;
  urgency_state: string;
  personal_status: string | null;
  snoozed_until: string | null;
  visible_now: boolean;
  actions: unknown[];
  module_route: string;
  urgency_label: string;
  responsibility_label: string;
};

type TaskState = {
  source_key: string;
  status: string | null;
  snoozed_until: string | null;
};

type ActionCatalogRow = {
  task_prefix: string;
  action_code: string;
  label: string;
  mutates_source: boolean;
  description: string | null;
};

type ReviewRouteRow = {
  source_report_id: string;
  review_id: string;
  canonical_asset_id: string | null;
};

const TASK_COLUMNS = [
  'organization_id',
  'cargo_id',
  'cargo_name',
  'task_key',
  'domain',
  'severity',
  'priority_score',
  'title',
  'evidence_summary',
  'status',
  'responsibility',
  'role_action',
  'occurred_at',
  'due_at',
  'escalation_at',
  'age_hours',
  'urgency_state',
].join(',');

const responsibilityRank: Record<RoleTask['responsibility'], number> = {
  owner: 0,
  support: 1,
  escalation: 2,
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function defaultModuleRoute(task: Pick<RoleTask, 'domain'>) {
  if (task.domain === 'maintenance') return '/dashboard/mantenimiento';
  if (task.domain === 'hse') return '/dashboard/sostenibilidad';
  if (task.domain === 'plant' || task.domain === 'drilling') return '/dashboard/produccion';
  if (task.domain === 'finance') return '/dashboard/finanzas';
  if (task.domain === 'inventory') return '/dashboard/bodega';
  return '/dashboard';
}

function resolveTaskRoute(task: RoleTask, reviewRoutes: Map<string, ReviewRouteRow>) {
  const [kind, rawId, ...rest] = task.task_key.split(':');

  if (kind === 'drilling_maintenance' && rawId && rest.length === 0) {
    const review = reviewRoutes.get(rawId);
    if (review?.review_id) {
      const assetParam = review.canonical_asset_id ? `assetId=${encodeURIComponent(review.canonical_asset_id)}&` : '';
      return `/dashboard/mantenimiento/ordenes-trabajo/create?${assetParam}reviewId=${encodeURIComponent(review.review_id)}&workType=corrective&priority=critical`;
    }
  }

  if (kind === 'work_order' && rawId && rest.length === 0 && UUID_PATTERN.test(rawId)) {
    return `/dashboard/mantenimiento/ordenes-trabajo/${rawId}`;
  }

  if (kind === 'maintenance_review' && rawId && rest.length === 0 && UUID_PATTERN.test(rawId)) {
    const priority = task.severity === 'critical' ? 'critical' : 'high';
    return `/dashboard/mantenimiento/ordenes-trabajo/create?reviewId=${rawId}&workType=corrective&priority=${priority}`;
  }

  if ((kind === 'incident' || kind === 'inspection' || kind === 'risk') && rawId && rest.length === 0 && UUID_PATTERN.test(rawId)) {
    return `/dashboard/sostenibilidad/prevencion-riesgos/acciones/${kind}/${rawId}`;
  }

  if (kind === 'shipment_review' && rawId && rest.length === 0 && UUID_PATTERN.test(rawId)) {
    return `/dashboard/produccion/despachos/revision/${rawId}`;
  }

  if (kind === 'data_health' && rawId === 'maintenance' && rest[0] === 'missing_asset') {
    return '/dashboard/mantenimiento/ordenes-trabajo?dataHealth=missing_asset';
  }

  if (kind === 'data_health' && rawId === 'inventory' && rest[0] === 'negative_stock') {
    return '/dashboard/bodega?status=negative&dataHealth=negative_stock';
  }

  if (kind === 'data_health' && rawId === 'inventory' && rest[0] === 'freshness') {
    return '/dashboard/compras/importar-existencias?dataHealth=freshness';
  }

  if (kind === 'data_health' && rawId === 'production' && rest[0] === 'freshness') {
    return '/dashboard/produccion/actualizar-fuentes';
  }

  if (kind === 'data_health' && rawId === 'production' && rest[0] === 'transport_freshness') {
    return '/dashboard/produccion/importacion-maestra?dataHealth=transport_freshness';
  }

  if (kind === 'data_health' && rawId === 'production' && rest[0] === 'plant_freshness') {
    return '/dashboard/produccion/importacion-maestra?dataHealth=plant_freshness';
  }

  if (kind === 'data_health' && rawId === 'production' && rest[0] === 'drilling_freshness') {
    return '/dashboard/produccion/actualizar-fuentes?source=drilling';
  }

  if (kind === 'data_health' && rawId && rest.length === 1) {
    return `/dashboard/calidad-datos/salud?domain=${encodeURIComponent(rawId)}&issue=${encodeURIComponent(rest[0])}`;
  }

  if (kind === 'finance' && rawId === 'missing_cost_centers' && rest.length === 0) {
    return '/dashboard/centros-costos';
  }

  if (kind === 'finance' && (rawId === 'zero_amount_lines' || rawId === 'validation') && rest.length === 0) {
    return `/dashboard/finanzas/importar?issue=${encodeURIComponent(rawId)}`;
  }

  return task.module_route || defaultModuleRoute(task);
}

function urgencyLabel(task: Pick<RoleTask, 'responsibility' | 'urgency_state'>) {
  if (task.responsibility === 'escalation') return 'Revisar escalación';
  if (task.responsibility === 'support') return 'Apoyar';
  if (task.urgency_state === 'escalated') return 'Resolver ahora';
  if (task.urgency_state === 'overdue') return 'Vencida';
  if (task.urgency_state === 'due_soon') return 'Próxima a vencer';
  return 'Pendiente';
}

function responsibilityLabel(responsibility: RoleTask['responsibility']) {
  if (responsibility === 'owner') return 'Mi tarea';
  if (responsibility === 'support') return 'Apoyo';
  if (responsibility === 'escalation') return 'Escalación';
  return responsibility;
}

function deduplicateTasks(rows: RoleTask[]) {
  const byTaskKey = new Map<string, RoleTask>();

  for (const task of rows) {
    const current = byTaskKey.get(task.task_key);
    if (!current) {
      byTaskKey.set(task.task_key, task);
      continue;
    }

    const currentRank = responsibilityRank[current.responsibility];
    const nextRank = responsibilityRank[task.responsibility];
    const shouldReplace =
      nextRank < currentRank ||
      (nextRank === currentRank && task.priority_score > current.priority_score);

    if (shouldReplace) byTaskKey.set(task.task_key, task);
  }

  return Array.from(byTaskKey.values()).sort((a, b) => {
    if (b.priority_score !== a.priority_score) return b.priority_score - a.priority_score;
    const aDue = a.due_at ? new Date(a.due_at).getTime() : Number.POSITIVE_INFINITY;
    const bDue = b.due_at ? new Date(b.due_at).getTime() : Number.POSITIVE_INFINITY;
    return aDue - bDue;
  });
}

function emptyRoleInbox(name: string | null, cargoId: string, cargoName: string | null) {
  return NextResponse.json({
    profile: { name, cargoId, cargoName },
    tasks: [],
    summary: { total: 0, owners: 0, support: 0, escalations: 0, critical: 0, overdue: 0, backlog: 0 },
    generatedAt: new Date().toISOString(),
    source: 'scoped_role_task_queries_v1',
    rawTaskCount: 0,
    deduplicatedTaskCount: 0,
    coverageAvailable: false,
  });
}

function degradedInbox(
  name: string | null,
  cargoId: string,
  cargoName: string | null,
  coverage: { owned_tasks?: number | null; owned_critical?: number | null; support_items?: number | null; escalations?: number | null } | null
) {
  return NextResponse.json({
    profile: { name, cargoId, cargoName },
    tasks: [],
    summary: {
      total: null,
      owners: coverage?.owned_tasks ?? null,
      support: coverage?.support_items ?? null,
      escalations: coverage?.escalations ?? null,
      critical: coverage?.owned_critical ?? null,
      overdue: null,
      backlog: null,
    },
    generatedAt: new Date().toISOString(),
    source: 'operational_role_inbox_coverage_v1',
    degraded: true,
    degradedReason: 'task_query_timeout',
    rawTaskCount: null,
    deduplicatedTaskCount: null,
    coverageAvailable: true,
  }, {
    status: 200,
    headers: {
      'Cache-Control': 'private, no-store',
      'X-Motil-Degraded': 'task-inbox-timeout',
    },
  });
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: profile, error: profileError } = await context.supabase
    .from('profiles')
    .select('cargo_id, full_name')
    .eq('id', context.userId)
    .eq('organization_id', context.organizationId)
    .maybeSingle();

  if (profileError) {
    console.error('[role-task-inbox] profile lookup failed', profileError);
    return NextResponse.json({ error: 'No se pudo resolver tu cargo' }, { status: 500 });
  }

  if (!profile?.cargo_id) {
    return NextResponse.json({
      profile: { name: profile?.full_name || null, cargoId: null, cargoName: null },
      tasks: [],
      summary: { total: 0, owners: 0, support: 0, escalations: 0, critical: 0, overdue: 0, backlog: 0 },
      generatedAt: new Date().toISOString(),
      source: 'scoped_role_task_queries_v1',
      coverageAvailable: false,
    });
  }

  const [{ data: cargo, error: cargoError }, { data: coverage, error: coverageError }] = await Promise.all([
    context.supabase.from('cargos').select('name').eq('id', profile.cargo_id).maybeSingle(),
    context.supabase
      .from('operational_role_inbox_coverage_v1')
      .select('cargo_id, owned_tasks, owned_critical, support_items, escalations')
      .eq('organization_id', context.organizationId)
      .eq('cargo_id', profile.cargo_id)
      .limit(1)
      .maybeSingle(),
  ]);

  if (cargoError) {
    console.error('[role-task-inbox] cargo lookup failed', cargoError);
    return NextResponse.json({ error: 'No se pudo resolver tu cargo' }, { status: 500 });
  }

  const cargoName = cargo?.name || null;
  let personalWorkOrderTasks;
  try {
    personalWorkOrderTasks = await loadPersonalMaintenanceTasks(context, profile.cargo_id, cargoName || 'Mantenimiento');
  } catch (error) {
    console.error('[role-task-inbox] personal OT lookup failed', error);
    return NextResponse.json({ error: 'No se pudieron consultar tus órdenes de trabajo asignadas' }, { status: 503 });
  }
  const hasPrivateFinanceInbox = cargoName?.toUpperCase() === 'JEFE ADM.';

  if (!coverageError && !coverage && !hasPrivateFinanceInbox && personalWorkOrderTasks.length === 0) {
    return emptyRoleInbox(profile.full_name || null, profile.cargo_id, cargoName);
  }

  if (coverageError) {
    console.warn('[role-task-inbox] coverage lookup failed; continuing with scoped task queries', coverageError);
  }

  // A missing cargo coverage row must never hide assigned work orders.
  const coverageMissing = !coverageError && !coverage && !hasPrivateFinanceInbox;
  const escalationLookup = coverageMissing || (!coverageError && coverage && Number(coverage.escalations || 0) === 0)
    ? Promise.resolve({ data: [], error: null })
    : context.supabase
        .from('role_task_escalations_v1')
        .select(TASK_COLUMNS)
        .eq('organization_id', context.organizationId)
        .eq('cargo_id', profile.cargo_id);
  const actionableLookup = coverageMissing
    ? Promise.resolve({ data: [], error: null })
    : context.supabase
        .from('role_tasks_actionable_v1')
        .select(TASK_COLUMNS)
        .eq('organization_id', context.organizationId)
        .eq('cargo_id', profile.cargo_id);
  const [actionableResult, escalationResult] = await Promise.all([actionableLookup, escalationLookup]);

  const taskError = actionableResult.error || escalationResult.error;
  if (taskError) {
    console.error('[role-task-inbox] scoped task lookup failed', taskError);
    if (taskError.code === '57014') {
      return degradedInbox(profile.full_name || null, profile.cargo_id, cargoName, coverage);
    }
    return NextResponse.json({ error: 'No se pudo cargar tu bandeja operacional' }, { status: 500 });
  }

  const baseRows = [...(actionableResult.data || []), ...(escalationResult.data || []), ...personalWorkOrderTasks] as unknown as Array<
    Omit<RoleTask, 'personal_status' | 'snoozed_until' | 'visible_now' | 'actions' | 'module_route' | 'urgency_label' | 'responsibility_label'>
  >;

  const [stateResult, catalogResult] = await Promise.all([
    context.supabase
      .from('user_action_states')
      .select('source_key, status, snoozed_until')
      .eq('organization_id', context.organizationId)
      .eq('user_id', context.userId),
    context.supabase
      .from('role_task_action_catalog_v1')
      .select('task_prefix, action_code, label, mutates_source, description'),
  ]);

  if (stateResult.error) {
    console.error('[role-task-inbox] personal state lookup failed', stateResult.error);
    return NextResponse.json({ error: 'No se pudo cargar el estado de tus acciones' }, { status: 500 });
  }

  if (catalogResult.error) {
    console.error('[role-task-inbox] action catalog lookup failed', catalogResult.error);
    return NextResponse.json({ error: 'No se pudo cargar el catálogo de acciones' }, { status: 500 });
  }

  const drillingSourceIds = Array.from(new Set(
    baseRows
      .map((task) => {
        const [kind, rawId, ...rest] = task.task_key.split(':');
        return kind === 'drilling_maintenance' && rawId && rest.length === 0 ? rawId : null;
      })
      .filter((value): value is string => Boolean(value))
  ));

  let reviewRows: ReviewRouteRow[] = [];
  if (drillingSourceIds.length) {
    const { data, error } = await context.supabase
      .from('drilling_maintenance_review_queue_v1')
      .select('source_report_id, review_id, canonical_asset_id')
      .eq('organization_id', context.organizationId)
      .in('source_report_id', drillingSourceIds);

    if (error) {
      console.warn('[role-task-inbox] review route lookup failed; using module fallback', error);
    } else {
      reviewRows = (data || []) as ReviewRouteRow[];
    }
  }

  const stateMap = new Map<string, TaskState>(
    ((stateResult.data || []) as TaskState[]).map((state) => [state.source_key, state])
  );
  const reviewRoutes = new Map<string, ReviewRouteRow>(
    reviewRows.map((row) => [row.source_report_id, row])
  );
  const catalogByPrefix = new Map<string, ActionCatalogRow[]>();

  for (const row of (catalogResult.data || []) as ActionCatalogRow[]) {
    const list = catalogByPrefix.get(row.task_prefix) || [];
    list.push(row);
    catalogByPrefix.set(row.task_prefix, list);
  }

  const nowMs = Date.now();
  const rawTasks = baseRows.map((base) => {
    const state = stateMap.get(base.task_key);
    const snoozedUntil = state?.snoozed_until || null;
    const visibleNow = !(state?.status === 'snoozed' && snoozedUntil && new Date(snoozedUntil).getTime() > nowMs);
    const prefix = base.task_key.split(':', 1)[0];
    const actions = base.responsibility === 'owner'
      ? (catalogByPrefix.get(prefix) || []).map((action) => ({
          code: action.action_code,
          label: action.label,
          mutates_source: action.mutates_source,
          description: action.description,
        }))
      : [];

    const task: RoleTask = {
      ...base,
      personal_status: state?.status || 'pending',
      snoozed_until: snoozedUntil,
      visible_now: visibleNow,
      actions,
      module_route: defaultModuleRoute(base),
      urgency_label: urgencyLabel(base),
      responsibility_label: responsibilityLabel(base.responsibility),
    };

    task.module_route = resolveTaskRoute(task, reviewRoutes);
    return task;
  }).filter((task) => task.visible_now);

  const tasks = deduplicateTasks(rawTasks);
  const backlogCutoff = nowMs - 30 * 24 * 60 * 60 * 1000;
  const isOverdue = (task: RoleTask) => Boolean(task.due_at && new Date(task.due_at).getTime() < nowMs);
  const isBacklog = (task: RoleTask) => Boolean(task.occurred_at && new Date(task.occurred_at).getTime() < backlogCutoff);

  return NextResponse.json({
    profile: { name: profile.full_name || null, cargoId: profile.cargo_id, cargoName },
    tasks,
    summary: {
      total: tasks.length,
      owners: tasks.filter((task) => task.responsibility === 'owner').length,
      support: tasks.filter((task) => task.responsibility === 'support').length,
      escalations: tasks.filter((task) => task.responsibility === 'escalation').length,
      critical: tasks.filter((task) => task.severity === 'critical').length,
      overdue: tasks.filter(isOverdue).length,
      backlog: tasks.filter(isBacklog).length,
    },
    generatedAt: new Date().toISOString(),
    source: 'scoped_role_tasks_and_personal_work_orders_v1',
    rawTaskCount: rawTasks.length,
    deduplicatedTaskCount: tasks.length,
    coverageAvailable: true,
  });
}
