'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CalendarDays, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { FilterToolbar, FilterToolbarActions, FilterToolbarGroup } from '@/components/ui/filter-toolbar';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';

type TaskSource = 'maintenance' | 'hse' | 'legal' | 'procurement' | 'finance';
type TaskItem = {
  id: string;
  source: TaskSource;
  source_label: string;
  kind: string;
  date: string;
  title: string;
  subtitle: string | null;
  reference: string | null;
  status: string;
  status_label: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  priority_label: string;
  owner: string | null;
  href: string;
  overdue: boolean;
  days_until: number;
};

type TasksResponse = {
  data: TaskItem[];
  summary: { overdue: number; today: number; next_7_days: number; total: number };
};

const fetcher = async (url: string): Promise<TasksResponse> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload;
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function relativeLabel(days: number, t: Dictionary['app']['calendar']) {
  if (days < -1) return fill(t.relative.daysAgo, { n: Math.abs(days) });
  if (days === -1) return t.relative.yesterday;
  if (days === 0) return t.relative.today;
  if (days === 1) return t.relative.tomorrow;
  return fill(t.relative.inDays, { n: days });
}

function formatDate(value: string, dateLocale: string) {
  const date = new Date(`${value}T12:00:00`);
  return Number.isNaN(date.getTime())
    ? value
    : date.toLocaleDateString(dateLocale, { day: '2-digit', month: 'short', year: 'numeric' });
}

function priorityVariant(priority: TaskItem['priority']) {
  if (priority === 'critical') return 'destructive' as const;
  if (priority === 'high') return 'default' as const;
  return 'outline' as const;
}

export function OperationalCalendar({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.calendar;
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CL';
  const [view, setView] = useState<'all' | 'overdue' | 'today' | 'week'>('all');
  const [query, setQuery] = useState('');
  const { data, error, isLoading, mutate, isValidating } = useSWR<TasksResponse>(
    '/api/calendar/operational?days=90&scope=open',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  const tasks = useMemo(() => {
    const term = query.trim().toLocaleLowerCase(dateLocale);
    return (data?.data || []).filter((task) => {
      if (view === 'overdue' && !task.overdue) return false;
      if (view === 'today' && task.days_until !== 0) return false;
      if (view === 'week' && !(task.days_until >= 0 && task.days_until <= 7)) return false;
      if (!term) return true;
      return [task.title, task.subtitle, task.reference, task.owner, task.source_label]
        .some((value) => value?.toLocaleLowerCase(dateLocale).includes(term));
    });
  }, [data?.data, query, view, dateLocale]);

  const summary = data?.summary ?? null;
  const summaryValue = (key: keyof TasksResponse['summary']) => isLoading || error || !summary ? '—' : summary[key].toLocaleString(dateLocale);

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>{t.eyebrow}</PageHeaderEyebrow>
          <PageHeaderTitle>{t.title}</PageHeaderTitle>
          <PageHeaderDescription>{t.description}</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
            <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
            {t.refresh}
          </Button>
          <Button asChild><Link href="/dashboard/mantenimiento/ordenes-trabajo/create">{t.createWorkOrder}</Link></Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-card sm:grid-cols-4">
        {([
          [t.summary.open, summaryValue('total')],
          [t.summary.overdue, summaryValue('overdue')],
          [t.summary.today, summaryValue('today')],
          [t.summary.week, summaryValue('next_7_days')],
        ] as const).map(([label, value]) => (
          <div key={String(label)} className="border-b border-r border-border px-4 py-3 last:border-r-0 sm:px-5 sm:py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
          </div>
        ))}
      </div>

      <FilterToolbar>
        <FilterToolbarGroup>
          <div className="relative min-w-0 flex-1 sm:max-w-md">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t.searchPlaceholder} className="pl-9" />
          </div>
        </FilterToolbarGroup>
        <FilterToolbarActions>
          <Tabs value={view} onValueChange={(value) => setView(value as typeof view)}>
            <TabsList className="max-w-[calc(100vw-2rem)] justify-start overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <TabsTrigger value="all">{t.tabs.all}</TabsTrigger>
              <TabsTrigger value="overdue">{t.tabs.overdue}</TabsTrigger>
              <TabsTrigger value="today">{t.tabs.today}</TabsTrigger>
              <TabsTrigger value="week">{t.tabs.week}</TabsTrigger>
            </TabsList>
          </Tabs>
        </FilterToolbarActions>
      </FilterToolbar>

      {isLoading ? <StatePanel tone="loading" title={t.loading.title} description={t.loading.description} /> : null}
      {error ? <StatePanel tone="error" title={t.error.title} description={fill(t.error.description, { message: error.message })} actions={<Button variant="outline" onClick={() => void mutate()}>{t.error.retry}</Button>} /> : null}
      {!isLoading && !error && tasks.length === 0 ? <StatePanel tone="neutral" icon={CheckCircle2} title={t.empty.title} description={t.empty.description} /> : null}

      {!isLoading && !error && tasks.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {tasks.map((task) => (
              <article key={task.id} className="grid gap-4 px-4 py-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:px-5">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{task.source_label}</Badge>
                    <Badge variant="outline">{task.kind}</Badge>
                    <Badge variant={priorityVariant(task.priority)}>{task.priority_label}</Badge>
                    {task.overdue ? <Badge variant="destructive">{t.overdueBadge}</Badge> : null}
                  </div>
                  <h2 className="mt-2 text-sm font-semibold leading-6 text-foreground">{task.title}</h2>
                  {task.subtitle ? <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{task.subtitle}</p> : null}
                  <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    {task.reference ? <span>{task.reference}</span> : null}
                    {task.owner ? <span>{task.owner}</span> : null}
                    <span className="inline-flex items-center gap-1"><CalendarDays className="h-3.5 w-3.5" />{formatDate(task.date, dateLocale)}</span>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3 md:justify-end">
                  <span className={`text-xs font-medium ${task.overdue ? 'text-destructive' : 'text-muted-foreground'}`}>
                    {task.overdue ? <AlertTriangle className="mr-1 inline h-3.5 w-3.5" /> : null}{relativeLabel(task.days_until, t)}
                  </span>
                  <Button asChild variant="outline" size="sm" className="shrink-0"><Link href={task.href}>{t.openAction}<ArrowRight className="h-4 w-4" /></Link></Button>
                </div>
              </article>
            ))}
          </div>
        </div>
      ) : null}
    </div>
  );
}
