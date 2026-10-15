'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, Clock3, Inbox, RefreshCw, Search, ShieldAlert, Users, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

type Task = {
  task_key: string;
  cargo_name: string;
  domain: string;
  severity: 'critical' | 'warning' | 'info';
  priority_score: number;
  title: string;
  evidence_summary: string | null;
  responsibility: 'owner' | 'support' | 'escalation';
  occurred_at: string | null;
  due_at: string | null;
  urgency_state: string;
  urgency_label: string;
  responsibility_label: string;
  module_route: string;
};

type InboxPayload = {
  profile?: { name?: string | null; cargoName?: string | null };
  summary?: { total: number | null; owners: number | null; support: number | null; escalations: number | null; critical: number | null; overdue: number | null; backlog: number | null };
  tasks?: Task[];
  degraded?: boolean;
  degradedReason?: string;
};

type StateRow = { source_key: string; status: 'pending' | 'read' | 'snoozed'; snoozed_until?: string | null };
type FamilyPreferences = Record<string, boolean>;
type TaskFilter = 'all' | 'critical' | 'overdue' | 'owner';
type LaneKey = 'current' | 'overdue' | 'support' | 'escalations';
type FamilyKey = 'dataHealth' | 'maintenanceReview' | 'workOrder' | 'incident' | 'inspection' | 'risk' | 'inventory' | 'plant' | 'finance' | 'hse' | 'maintenance' | 'other';

const LANE_ORDER: LaneKey[] = ['current', 'overdue', 'support', 'escalations'];

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload || {};
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function laneKey(task: Task): LaneKey {
  if (task.responsibility === 'escalation') return 'escalations';
  if (task.responsibility === 'support') return 'support';
  if (task.urgency_state === 'overdue' || task.urgency_state === 'escalated') return 'overdue';
  return 'current';
}

function familyKey(task: Task): FamilyKey {
  if (task.task_key.startsWith('data_health:')) return 'dataHealth';
  if (task.task_key.startsWith('maintenance_review:')) return 'maintenanceReview';
  if (task.task_key.startsWith('work_order:')) return 'workOrder';
  if (task.task_key.startsWith('incident:')) return 'incident';
  if (task.task_key.startsWith('inspection:')) return 'inspection';
  if (task.task_key.startsWith('risk:')) return 'risk';
  if (task.domain === 'inventory') return 'inventory';
  if (task.domain === 'plant') return 'plant';
  if (task.domain === 'finance') return 'finance';
  if (task.domain === 'hse') return 'hse';
  if (task.domain === 'maintenance') return 'maintenance';
  return 'other';
}

const severityRank: Record<Task['severity'], number> = { critical: 0, warning: 1, info: 2 };

function urgencyRank(task: Task) {
  if (task.urgency_state === 'escalated') return 0;
  if (task.urgency_state === 'overdue') return 1;
  return 2;
}

function taskOrder(sortLocale: string) {
  return (a: Task, b: Task) => severityRank[a.severity] - severityRank[b.severity]
    || urgencyRank(a) - urgencyRank(b)
    || Number(b.priority_score || 0) - Number(a.priority_score || 0)
    || String(a.due_at || '9999').localeCompare(String(b.due_at || '9999'))
    || a.title.localeCompare(b.title, sortLocale);
}

function familyOrder(order: (a: Task, b: Task) => number) {
  return (a: Task[], b: Task[]) => {
    const aCritical = a.some((task) => task.severity === 'critical');
    const bCritical = b.some((task) => task.severity === 'critical');
    if (aCritical !== bCritical) return aCritical ? -1 : 1;
    return order([...a].sort(order)[0], [...b].sort(order)[0]);
  };
}

function preferenceStorageKey(name: string | null | undefined, cargoName: string | null | undefined) {
  return `motil:actions-family-layout:${String(name || 'user')}:${String(cargoName || 'cargo')}`;
}

function matchesFilter(task: Task, filter: TaskFilter) {
  if (filter === 'critical') return task.severity === 'critical';
  if (filter === 'overdue') return task.urgency_state === 'overdue' || task.urgency_state === 'escalated';
  if (filter === 'owner') return task.responsibility === 'owner';
  return true;
}

function normalizeSearch(value: string) {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
}

export function ActionsInbox({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.actions;
  const sortLocale = locale === 'en' ? 'en' : 'es';
  const inbox = useSWR<InboxPayload>('/api/actions/inbox', fetcher, { refreshInterval: 60000, revalidateOnFocus: false });
  const states = useSWR('/api/actions/state', fetcher, { revalidateOnFocus: false });
  const [familyPreferences, setFamilyPreferences] = useState<FamilyPreferences>({});
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [stateWriteError, setStateWriteError] = useState<string | null>(null);
  const profileName = inbox.data?.profile?.name;
  const cargoName = inbox.data?.profile?.cargoName;

  useEffect(() => {
    if (!cargoName || typeof window === 'undefined') return;
    try {
      const saved = window.localStorage.getItem(preferenceStorageKey(profileName, cargoName));
      setFamilyPreferences(saved ? JSON.parse(saved) as FamilyPreferences : {});
    } catch {
      setFamilyPreferences({});
    } finally {
      setPreferencesLoaded(true);
    }
  }, [profileName, cargoName]);

  function saveFamilyPreference(key: string, open: boolean) {
    setFamilyPreferences((current) => {
      const next = { ...current, [key]: open };
      if (typeof window !== 'undefined' && cargoName) {
        try {
          window.localStorage.setItem(preferenceStorageKey(profileName, cargoName), JSON.stringify(next));
        } catch {
          // UI preference persistence is optional and must never block the operational inbox.
        }
      }
      return next;
    });
  }

  const stateMap = new Map<string, StateRow>((states.data?.states || []).map((row: StateRow) => [row.source_key, row]));
  const now = Date.now();
  const tasks = (inbox.data?.tasks || []).filter((task) => {
    const state = stateMap.get(task.task_key);
    return !(state?.status === 'snoozed' && state.snoozed_until && new Date(state.snoozed_until).getTime() > now);
  });
  const filteredTasks = tasks.filter((task) => matchesFilter(task, taskFilter));
  const visibleTasks = filteredTasks.filter((task) => matchesSearch(task, searchQuery));

  function matchesSearch(task: Task, query: string) {
    const normalized = normalizeSearch(query);
    if (!normalized) return true;
    const haystack = normalizeSearch([
      task.task_key,
      task.title,
      task.evidence_summary || '',
      task.domain,
      task.cargo_name,
      task.responsibility_label,
      task.urgency_label,
      task.module_route,
      t.families[familyKey(task)],
    ].join(' '));
    return normalized.split(/\s+/).every((term) => haystack.includes(term));
  }

  async function setState(sourceKey: string, status: 'pending' | 'read' | 'snoozed') {
    setStateWriteError(null);
    const response = await fetch('/api/actions/state', {
      method: 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ sourceKey, status }),
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      setStateWriteError(payload?.error || t.stateWriteError);
      return;
    }
    await states.mutate();
  }

  const summary = inbox.data?.summary;
  const summaryUnavailable = inbox.isLoading || Boolean(inbox.error) || !summary;
  const summaryValue = (key: 'owners' | 'critical' | 'overdue' | 'escalations') =>
    summaryUnavailable ? '—' : (summary[key] ?? '—');
  const filterCounts = {
    all: tasks.length,
    critical: tasks.filter((task) => task.severity === 'critical').length,
    overdue: tasks.filter((task) => task.urgency_state === 'overdue' || task.urgency_state === 'escalated').length,
    owner: tasks.filter((task) => task.responsibility === 'owner').length,
  };
  const filterCount = (value: TaskFilter) => summaryUnavailable || inbox.data?.degraded ? '—' : filterCounts[value];
  const hasSearch = normalizeSearch(searchQuery).length > 0;
  const order = taskOrder(sortLocale);

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">{cargoName || t.fallbackCargo}</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Mi trabajo</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Tareas y solicitudes que requieren atención según tu cargo. Abre una tarea para ver su detalle.</p>
      </div>
      <Button variant="outline" onClick={() => { setStateWriteError(null); void inbox.mutate(); void states.mutate(); }}><RefreshCw className="mr-2 h-4 w-4" />{t.refresh}</Button>
    </section>



    {stateWriteError ? <Card className="border-destructive/30 shadow-none"><CardContent className="p-4 text-sm text-destructive">{stateWriteError}</CardContent></Card> : null}
    {inbox.data?.degraded ? <Card className="border-amber-500/30 shadow-none"><CardContent className="p-4 text-sm text-muted-foreground"><strong className="text-foreground">{t.degradedTitle}.</strong> {t.degradedDescription}</CardContent></Card> : null}



    {inbox.error || states.error ? <Card className="shadow-none"><CardContent className="p-8 text-center text-sm text-muted-foreground">{t.inboxError}</CardContent></Card> : inbox.isLoading || states.isLoading ? <Card className="shadow-none"><CardContent className="p-8 text-sm text-muted-foreground">{t.loading}</CardContent></Card> : inbox.data?.degraded ? null : tasks.length === 0 ? <Card className="shadow-none"><CardContent className="p-10 text-center"><CheckCircle2 className="mx-auto h-7 w-7" /><p className="mt-3 font-medium">{t.empty.title}</p><p className="mt-1 text-sm text-muted-foreground">{t.empty.description}</p></CardContent></Card> : visibleTasks.length === 0 ? <Card className="shadow-none"><CardContent className="p-8 text-center"><p className="font-medium">{t.noResults.title}</p><p className="mt-1 text-sm text-muted-foreground">{t.noResults.description}</p><div className="mt-4 flex justify-center gap-2">{hasSearch ? <Button size="sm" variant="outline" onClick={() => setSearchQuery('')}>{t.noResults.clear}</Button> : null}{taskFilter !== 'all' ? <Button size="sm" variant="outline" onClick={() => setTaskFilter('all')}>{t.noResults.viewAll}</Button> : null}</div></CardContent></Card> : <div className="space-y-5">
      {LANE_ORDER.map((lane) => {
        const laneTasks = visibleTasks.filter((task) => laneKey(task) === lane);
        if (!laneTasks.length) return null;
        const Icon = lane === 'escalations' ? ShieldAlert : lane === 'support' ? Users : lane === 'overdue' ? Clock3 : Inbox;
        const families = Array.from(new Set(laneTasks.map(familyKey)))
          .map((key) => ({ key, tasks: laneTasks.filter((task) => familyKey(task) === key).sort(order) }))
          .sort((a, b) => familyOrder(order)(a.tasks, b.tasks));
        return <Card key={lane} className="shadow-none">
          <CardHeader className="pb-3"><CardTitle className="flex items-center gap-2 text-lg"><Icon className="h-5 w-5" />{t.lanes[lane]}<Badge variant="secondary" className="ml-auto">{laneTasks.length}</Badge></CardTitle></CardHeader>
          <CardContent className="space-y-3 border-t p-4">
            {families.map(({ key, tasks: familyTasks }) => {
              const criticalCount = familyTasks.filter((task) => task.severity === 'critical').length;
              const overdueCount = familyTasks.filter((task) => task.urgency_state === 'overdue' || task.urgency_state === 'escalated').length;
              const preferenceKey = `${lane}:${key}`;
              const defaultOpen = hasSearch || criticalCount > 0 || key === 'workOrder';
              const isOpen = hasSearch ? true : preferencesLoaded && Object.hasOwn(familyPreferences, preferenceKey) ? familyPreferences[preferenceKey] : defaultOpen;
              return <details key={key} open={isOpen} onToggle={(event) => {
                if (!preferencesLoaded || hasSearch) return;
                saveFamilyPreference(preferenceKey, event.currentTarget.open);
              }} className="group overflow-hidden rounded-lg border bg-card">
                <summary className="flex cursor-pointer list-none items-center gap-2 bg-muted/20 px-4 py-3 marker:hidden hover:bg-muted/35">
                  <p className="text-sm font-medium">{t.families[key]}</p>
                  <Badge variant="secondary">{familyTasks.length}</Badge>
                  {criticalCount > 0 ? <Badge variant="destructive">{fill(criticalCount === 1 ? t.criticalCount : t.criticalCountPlural, { n: criticalCount })}</Badge> : null}
                  {criticalCount === 0 && overdueCount > 0 ? <Badge variant="outline">{fill(overdueCount === 1 ? t.overdueCount : t.overdueCountPlural, { n: overdueCount })}</Badge> : null}
                  <span className="ml-auto text-xs text-muted-foreground group-open:hidden">{t.expand}</span>
                  <span className="ml-auto hidden text-xs text-muted-foreground group-open:inline">{t.collapse}</span>
                </summary>
                <div className="divide-y border-t">
                  {familyTasks.map((task) => {
                    const state = stateMap.get(task.task_key);
                    const isOwner = task.responsibility === 'owner';
                    return <div key={task.task_key} className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{task.title}</p>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                          <Badge variant={task.severity === 'critical' ? 'destructive' : 'outline'}>{t.severity[task.severity]}</Badge>
                          <span>{task.responsibility_label}</span>
                          {task.urgency_label ? <span>{task.urgency_label}</span> : null}
                        </div>
                        <details className="mt-2 text-sm" data-testid="task-row-details">
                          <summary className="w-fit cursor-pointer text-xs text-muted-foreground hover:text-foreground">Ver detalles</summary>
                          <div className="mt-2 space-y-2 border-l pl-3 text-sm text-muted-foreground">
                            {task.evidence_summary ? <p>{task.evidence_summary}</p> : null}
                            <p>{task.domain} · {task.cargo_name}</p>
                            {state?.status === 'read' ? <p>{t.readBadge}</p> : null}
                            <div className="flex flex-wrap gap-2">
                              <Button size="sm" variant="outline" onClick={() => void setState(task.task_key, state?.status === 'read' ? 'pending' : 'read')}>{state?.status === 'read' ? t.markPending : t.markRead}</Button>
                              {task.severity !== 'critical' ? <Button size="sm" variant="outline" onClick={() => void setState(task.task_key, 'snoozed')}><Clock3 className="mr-2 h-4 w-4" />{t.snooze}</Button> : null}
                            </div>
                          </div>
                        </details>
                      </div>
                      <Button asChild size="sm" variant={isOwner ? 'default' : 'outline'}><Link href={task.module_route}>{isOwner ? t.cta.resolve : task.responsibility === 'support' ? t.cta.support : t.cta.review}<ArrowRight className="ml-2 h-4 w-4" /></Link></Button>
                    </div>;
                  })}
                </div>
              </details>;
            })}
          </CardContent>
        </Card>;
      })}
    </div>}
    <details data-testid="actions-more-details" className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
        Ver más · Buscar, filtrar e indicadores
      </summary>
      <div className="space-y-5 border-t p-4">
    <div className="space-y-3">
      <div className="relative max-w-2xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder={t.searchPlaceholder}
          aria-label={t.searchAria}
          className="h-10 w-full rounded-md border border-input bg-background pl-9 pr-10 text-sm outline-none ring-offset-background placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        />
        {hasSearch ? <button type="button" aria-label={t.clearSearch} onClick={() => setSearchQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"><X className="h-4 w-4" /></button> : null}
      </div>

      <div className="flex flex-wrap items-center gap-2" aria-label={t.filtersAria}>
        {(['all', 'critical', 'overdue', 'owner'] as const).map((value) => <Button key={value} size="sm" variant={taskFilter === value ? 'default' : 'outline'} onClick={() => setTaskFilter(value)} disabled={summaryUnavailable || Boolean(inbox.data?.degraded)}>{t.filters[value]}<Badge variant="secondary" className="ml-2">{filterCount(value)}</Badge></Button>)}
        {(taskFilter !== 'all' || hasSearch) && !summaryUnavailable ? <span className="text-xs text-muted-foreground">{fill(t.showing, { visible: visibleTasks.length, total: tasks.length })}</span> : null}
      </div>
    </div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t.summary.owners}</p><p className="mt-1 text-2xl font-semibold">{summaryValue('owners')}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t.summary.critical}</p><p className="mt-1 text-2xl font-semibold">{summaryValue('critical')}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t.summary.overdue}</p><p className="mt-1 text-2xl font-semibold">{summaryValue('overdue')}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{t.summary.escalations}</p><p className="mt-1 text-2xl font-semibold">{summaryValue('escalations')}</p></CardContent></Card>
    </div>
      </div>
    </details>
  </div>;
}
