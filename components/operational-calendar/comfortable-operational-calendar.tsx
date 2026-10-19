'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  X,
  ExternalLink,
  History,
  RefreshCw,
  Search,
  ShieldCheck,
  FileCheck,
  Landmark,
  ShoppingCart,
  Wrench,
  ImageOff,
  UsersRound,
  type LucideIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

type CalendarSource = 'maintenance' | 'hse' | 'legal' | 'procurement' | 'finance' | 'people';
type CalendarScope = 'active' | 'historical' | 'all';
type CalendarPeriod = '7' | '14' | 'month';

type OperationalCalendarItem = {
  id: string;
  source: CalendarSource;
  kind: string;
  date: string;
  title: string;
  reference: string | null;
  status_label: string;
  status: string;
  overdue: boolean;
  owner: string | null;
  location: string | null;
  href: string;
  historical: boolean;
  completed_at: string | null;
  image_urls?: string[];
  asset_name?: string | null;
  asset_code?: string | null;
  asset_cost_center?: string | null;
};

type CalendarResponse = {
  viewerName: string | null;
  allowedSources: Record<CalendarSource, boolean>;
  data: OperationalCalendarItem[];
  summary: {
    overdue: number;
    today: number;
    total: number;
    historical: number;
    by_source: Record<CalendarSource, number>;
  };
  warnings: string[];
  range: {
    today: string;
    scope: CalendarScope;
  };
};

function EvidenceImage({ src, alt, className }: { src: string; alt: string; className: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [src]);
  if (failed) {
    return (
      <div role="img" aria-label={`${alt}: imagen no disponible`} className={`${className} flex items-center justify-center bg-muted text-muted-foreground`}>
        <ImageOff className="h-5 w-5" aria-hidden="true" />
      </div>
    );
  }
  return <img src={src} alt={alt} loading="lazy" onError={() => setFailed(true)} className={className} />;
}

const OT_STATES = [
  { id: 'open', label: 'Abierta / pendiente', color: 'bg-orange-500', bar: 'border-orange-500/60 bg-orange-500/20 text-foreground' },
  { id: 'progress', label: 'En curso', color: 'bg-sky-500', bar: 'border-sky-500/60 bg-sky-500/20 text-foreground' },
  { id: 'paused', label: 'En pausa', color: 'bg-amber-300', bar: 'border-amber-400/60 bg-amber-400/15 text-foreground' },
  { id: 'closed', label: 'Cerrada', color: 'bg-emerald-500', bar: 'border-emerald-500/60 bg-emerald-500/20 text-foreground' },
  { id: 'overdue', label: 'Vencida', color: 'bg-red-500', bar: 'border-red-500/60 bg-red-500/20 text-foreground' },
  { id: 'cancelled', label: 'Cancelada', color: 'bg-zinc-500', bar: 'border-zinc-500/60 bg-zinc-500/15 text-foreground' },
] as const;

function otState(item: OperationalCalendarItem) {
  const state = (item.status || '').toLowerCase();
  if (['cancelled', 'canceled', 'cancelada', 'void', 'voided'].includes(state)) return OT_STATES[5];
  if (item.historical || ['completed', 'closed', 'completada', 'cerrada'].includes(state)) return OT_STATES[3];
  if (['paused', 'on_hold', 'pausada', 'en_pausa'].includes(state)) return OT_STATES[2];
  if (['in_progress', 'en_curso', 'started'].includes(state)) return OT_STATES[1];
  if (item.overdue) return OT_STATES[4];
  return OT_STATES[0];
}

const LABEL_WIDTH = 390;
const ROW_HEIGHT = 80;
const HEADER_HEIGHT = 76;
const BAR_HEIGHT = 42;

const PERIOD_CONFIG: Record<CalendarPeriod, { label: string; days: number; dayWidth: number }> = {
  '7': { label: '7 días', days: 7, dayWidth: 112 },
  '14': { label: '14 días', days: 14, dayWidth: 86 },
  month: { label: 'Mes', days: 31, dayWidth: 48 },
};

const SOURCE_META: Record<CalendarSource, { label: string; icon: LucideIcon; bar: string }> = {
  maintenance: {
    label: 'Mantenimiento',
    icon: Wrench,
    bar: 'border-orange-500/70 bg-orange-500/25 text-orange-50',
  },
  hse: {
    label: 'HSE',
    icon: ShieldCheck,
    bar: 'border-cyan-500/70 bg-cyan-500/25 text-cyan-50',
  },
  legal: {
    label: 'Legal',
    icon: FileCheck,
    bar: 'border-sky-500/70 bg-sky-500/25 text-sky-50',
  },
  procurement: {
    label: 'Abastecimiento',
    icon: ShoppingCart,
    bar: 'border-violet-500/70 bg-violet-500/25 text-violet-50',
  },
  finance: {
    label: 'Finanzas',
    icon: Landmark,
    bar: 'border-slate-500/70 bg-slate-500/25 text-slate-50',
  },
  people: {
    label: 'Personas',
    icon: UsersRound,
    bar: 'border-zinc-500/70 bg-zinc-500/25 text-zinc-50',
  },
};

const fetcher = async (url: string): Promise<CalendarResponse> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el calendario operativo');
  return payload as CalendarResponse;
};

function toDateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

function addDays(dateKey: string, amount: number) {
  const date = new Date(`${dateKey}T12:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return toDateKey(date);
}

function startOfChileanWorkWeek(today: string) {
  const weekday = new Date(today + 'T12:00:00Z').getUTCDay();
  return addDays(today, -((weekday + 6) % 7));
}

function diffDays(from: string, to: string) {
  const a = new Date(`${from}T12:00:00Z`).getTime();
  const b = new Date(`${to}T12:00:00Z`).getTime();
  return Math.round((b - a) / 86_400_000);
}

function buildDates(start: string, days: number) {
  return Array.from({ length: days }, (_, index) => addDays(start, index));
}

function formatMonth(dateKey: string) {
  return new Date(`${dateKey}T12:00:00`).toLocaleDateString('es-CL', {
    month: 'long',
    year: 'numeric',
  });
}

function formatShortDate(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`).toLocaleDateString('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export function ComfortableOperationalCalendar({ initialArea }: { initialArea?: CalendarSource } = {}) {
  const [scope, setScope] = useState<CalendarScope>('all');
  const [perspective, setPerspective] = useState<'mine' | 'area' | 'organization'>(initialArea ? 'area' : 'mine');
  const [source, setSource] = useState<'all' | CalendarSource>(initialArea || 'all');
  const [period, setPeriod] = useState<CalendarPeriod>('14');
  const [anchorDate, setAnchorDate] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [ownerFilter, setOwnerFilter] = useState('all');
  const [selectedItem, setSelectedItem] = useState<OperationalCalendarItem | null>(null);
  const [galleryIndex, setGalleryIndex] = useState<number | null>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  const { data, error, isLoading, isValidating, mutate } = useSWR<CalendarResponse>(
    `/api/calendar/operational?days=120&scope=${scope}`,
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 60_000 },
  );

  const today = data?.range.today || toDateKey(new Date());
  // Open on Monday: the two-week view shows this week AND the coming work week.
  const currentAnchor = anchorDate || startOfChileanWorkWeek(today);
  const periodConfig = PERIOD_CONFIG[period];
  const dates = useMemo(
    () => buildDates(currentAnchor, periodConfig.days),
    [currentAnchor, periodConfig.days],
  );
  const rangeEnd = dates.at(-1) || currentAnchor;
  const dayWidth = periodConfig.dayWidth;
  const totalWidth = LABEL_WIDTH + dates.length * dayWidth;
  const todayIndex = dates.indexOf(today);

  const items = data?.data || [];
  const summary = data?.summary || {
    overdue: 0,
    today: 0,
    total: 0,
    historical: 0,
    by_source: { maintenance: 0, hse: 0, legal: 0, procurement: 0, finance: 0, people: 0 },
  };

  const owners = useMemo(() => [...new Set(items.map(item => item.owner?.trim()).filter((name): name is string => Boolean(name)))].sort((a,b) => a.localeCompare(b, 'es')), [items]);

  const filteredItems = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('es-CL');

    return items.filter((item) => {
      if (perspective === 'area' && source !== 'all' && item.source !== source) return false;
      if (ownerFilter !== 'all' && item.owner?.trim() !== ownerFilter) return false;
      if (perspective === 'mine') {
        const viewer = data?.viewerName?.trim().toLocaleLowerCase('es-CL');
        if (!viewer || item.owner?.trim().toLocaleLowerCase('es-CL') !== viewer) return false;
      }
      if (term && ![item.title, item.reference, item.owner, item.kind, item.location]
        .some((value) => value?.toLocaleLowerCase('es-CL').includes(term))) return false;

      const itemEnd = item.historical && item.completed_at
        ? item.completed_at.slice(0, 10)
        : item.overdue
          ? today
          : item.date;

      return item.date <= rangeEnd && itemEnd >= currentAnchor;
    });
  }, [currentAnchor, items, rangeEnd, search, source, perspective, data?.viewerName, ownerFilter]);

  const goToToday = () => {
    setAnchorDate(null);
    timelineRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };

  const shiftPeriod = (direction: -1 | 1) => {
    setAnchorDate(addDays(currentAnchor, direction * (period === 'month' ? 14 : 7)));
    timelineRef.current?.scrollTo({ left: 0, behavior: 'smooth' });
  };

  useEffect(() => {
    timelineRef.current?.scrollTo({ left: 0 });
  }, [period, currentAnchor]);

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Calendario operativo continuo</h1>
          <p className="mt-0.5 max-w-3xl text-xs leading-5 text-muted-foreground">
            Actividades de Mantenimiento, HSE, Legal, Abastecimiento, Finanzas y Personas en una sola línea de tiempo de la organización.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(-1)}>
            <ChevronLeft className="mr-1 h-4 w-4" /> Anterior
          </Button>
          <Button variant="outline" size="sm" onClick={goToToday}>
            <CalendarDays className="mr-1 h-4 w-4" /> Hoy
          </Button>
          <Button variant="outline" size="sm" onClick={() => shiftPeriod(1)}>
            Siguiente <ChevronRight className="ml-1 h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => { setPerspective("area"); setSource("maintenance"); setScope("historical"); setPeriod("14"); setAnchorDate(addDays(today, -13)); }} disabled={data?.allowedSources?.maintenance === false}>
            <History className="mr-1 h-4 w-4" /> OT finalizadas
          </Button>
          <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isValidating}>
            <RefreshCw className={`mr-1 h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} /> Actualizar
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Perspectiva del calendario">
        {([{ id: 'mine', label: 'Mi calendario' }, { id: 'area', label: 'Área' }, { id: 'organization', label: 'Organización' }] as const).map((option) => (
          <Button key={option.id} size="sm" variant={perspective === option.id ? 'default' : 'outline'} onClick={() => { setPerspective(option.id); if (option.id === 'area' && source === 'all') setSource((Object.entries(data?.allowedSources || {}).find(([, allowed]) => allowed)?.[0] || 'maintenance') as CalendarSource); }} aria-pressed={perspective === option.id}>{option.label}</Button>
        ))}
      </div>
      {perspective === 'mine' && !data?.viewerName && !isLoading ? <p className="text-xs text-muted-foreground">Tu identidad no está disponible; no se muestran actividades personales sin asignación verificable.</p> : null}
      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-[minmax(260px,1fr)_140px_200px_125px]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Buscar OT, evento, responsable o referencia"
            className="pl-9"
          />
        </div>
        <Select value={scope} onValueChange={(value) => setScope(value as CalendarScope)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="active">Pendientes</SelectItem>
            <SelectItem value="historical">Históricos</SelectItem>
          </SelectContent>
        </Select>
        {perspective === 'area' ? <Select value={source} onValueChange={(value) => setSource(value as 'all' | CalendarSource)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas las áreas autorizadas</SelectItem>
            <SelectItem value="maintenance" disabled={data?.allowedSources?.maintenance === false}>Mantenimiento ({summary.by_source.maintenance})</SelectItem>
            <SelectItem value="hse" disabled={data?.allowedSources?.hse === false}>HSE ({summary.by_source.hse})</SelectItem>
            <SelectItem value="legal" disabled={data?.allowedSources?.legal === false}>Legal ({summary.by_source.legal})</SelectItem>
            <SelectItem value="procurement" disabled={data?.allowedSources?.procurement === false}>Abastecimiento ({summary.by_source.procurement})</SelectItem>
            <SelectItem value="finance" disabled={data?.allowedSources?.finance === false}>Finanzas ({summary.by_source.finance})</SelectItem>
            <SelectItem value="people" disabled={data?.allowedSources?.people === false}>Personas ({summary.by_source.people})</SelectItem>
          </SelectContent>
        </Select> : <div className="flex items-center text-xs text-muted-foreground">{perspective === 'mine' ? 'Solo actividades asignadas a mí. Para ver las OT de otros responsables, selecciona Área u Organización.' : 'Todas las áreas autorizadas'}</div>}
        <Select value={period} onValueChange={(value) => setPeriod(value as CalendarPeriod)}>
          <SelectTrigger aria-label="Escala temporal"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 días</SelectItem>
            <SelectItem value="14">14 días</SelectItem>
            <SelectItem value="month">Mes</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {perspective !== 'mine' ? (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <span className="text-muted-foreground">Responsable</span>
          <Select value={ownerFilter} onValueChange={setOwnerFilter}>
            <SelectTrigger className="w-[240px]" aria-label="Filtrar por responsable"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los responsables</SelectItem>
              {owners.map(owner => <SelectItem key={owner} value={owner}>{owner}</SelectItem>)}
            </SelectContent>
          </Select>
          {ownerFilter !== 'all' ? <Button variant="ghost" size="sm" onClick={() => setOwnerFilter('all')}>Limpiar filtro</Button> : null}
        </div>
      ) : null}
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge variant="outline">{filteredItems.length} visibles</Badge>
        <Badge variant="outline">{periodConfig.label}</Badge>
        <Badge variant="outline" className="border-destructive/40 text-destructive">{summary.overdue} vencidos</Badge>
        <Badge variant="outline" className="border-emerald-500/40 text-emerald-500">
          <History className="mr-1 h-3 w-3" />{summary.historical} históricos
        </Badge>
        <span className="ml-auto text-sm font-medium text-foreground">
          {formatShortDate(currentAnchor)} — {formatShortDate(rangeEnd)}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-muted-foreground" aria-label="Leyenda de estados de órdenes de trabajo">
        <span className="font-medium text-foreground">Estados OT</span>
        {OT_STATES.map((state) => (
          <span key={state.id} className="inline-flex items-center gap-1.5">
            <span aria-hidden="true" className={`h-2.5 w-2.5 rounded-sm ${state.color}`} />
            {state.label}
          </span>
        ))}
      </div>

      {data?.warnings?.length ? (
        <div className="flex gap-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-3 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
          <span>{data.warnings.join(' ')}</span>
        </div>
      ) : null}

      {error ? (
        <Card className="border-destructive/40">
          <CardContent className="p-6 text-sm text-destructive">{error.message}</CardContent>
        </Card>
      ) : null}

      <Card className="overflow-hidden shadow-none">
        <div ref={timelineRef} className="max-h-[78vh] overflow-auto bg-card">
          <div className="relative" style={{ width: totalWidth, minWidth: '100%' }}>
            <div className="sticky top-0 z-30 flex border-b bg-card shadow-[0_3px_10px_rgba(0,0,0,.08)]" style={{ height: HEADER_HEIGHT }}>
              <div className="sticky left-0 z-40 flex shrink-0 items-end border-r bg-card px-4 pb-2" style={{ width: LABEL_WIDTH }}>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Actividad</p>
                  <p className="mt-0.5 text-sm font-semibold">{filteredItems.length} registros en el período</p>
                </div>
              </div>

              <div className="relative flex" style={{ width: dates.length * dayWidth }}>
                {dates.map((dateKey, index) => {
                  const date = new Date(`${dateKey}T12:00:00`);
                  const isToday = dateKey === today;
                  const isWeekend = [0, 6].includes(date.getDay());
                  const monthStart = index === 0 || dateKey.slice(0, 7) !== dates[index - 1].slice(0, 7);

                  return (
                    <div
                      key={dateKey}
                      className={`relative shrink-0 border-r px-1 pb-3 pt-2 text-center ${isWeekend ? 'bg-muted/30' : ''} ${isToday ? 'bg-orange-500/10' : ''}`}
                      style={{ width: dayWidth }}
                    >
                      {monthStart ? (
                        <span className="absolute left-2 top-2 whitespace-nowrap text-[11px] font-semibold capitalize text-muted-foreground">
                          {formatMonth(dateKey)}
                        </span>
                      ) : null}
                      <div className="mt-5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                        {date.toLocaleDateString('es-CL', { weekday: 'short' })}
                      </div>
                      <div className={`mt-0.5 text-base font-semibold ${isToday ? 'text-orange-500' : 'text-foreground'}`}>
                        {date.getDate()}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {isLoading ? (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, index) => <div key={index} className="h-24 animate-pulse rounded bg-muted" />)}
              </div>
            ) : null}

            {!isLoading && filteredItems.length === 0 ? (
              <div className="flex h-56 items-center justify-center px-6 text-center text-sm text-muted-foreground">
                No hay actividades en estos días. Usa Anterior para consultar el historial o cambia el período.
              </div>
            ) : null}

            {!isLoading ? filteredItems.map((item) => {
              const SourceIcon = SOURCE_META[item.source].icon;
              const rawEnd = item.historical && item.completed_at
                ? item.completed_at.slice(0, 10)
                : item.overdue
                  ? today
                  : item.date;
              const clippedStart = item.date < currentAnchor ? currentAnchor : item.date;
              const clippedEnd = rawEnd > rangeEnd ? rangeEnd : rawEnd;
              const startIndex = Math.max(0, diffDays(currentAnchor, clippedStart));
              const duration = Math.max(1, diffDays(clippedStart, clippedEnd) + 1);
              const width = Math.max(dayWidth - 12, duration * dayWidth - 12);
              const left = LABEL_WIDTH + startIndex * dayWidth + 6;
              const barPrimary = duration === 1 ? (item.reference?.replace(/^OT-\d{4}-/, 'OT ') || item.kind) : item.title;
              const barSecondary = item.historical && item.completed_at
                ? `Completada ${formatShortDate(item.completed_at)}`
                : `${item.reference || item.kind} · ${item.status_label}`;

              return (
                <div key={item.id} className="relative border-b" style={{ width: totalWidth, height: ROW_HEIGHT }}>
                  <div className="absolute inset-y-0 flex" style={{ left: LABEL_WIDTH, width: dates.length * dayWidth }}>
                    {dates.map((dateKey) => {
                      const date = new Date(`${dateKey}T12:00:00`);
                      const isWeekend = [0, 6].includes(date.getDay());
                      const isToday = dateKey === today;
                      return (
                        <div
                          key={dateKey}
                          className={`h-full shrink-0 border-r ${isWeekend ? 'bg-muted/20' : ''} ${isToday ? 'bg-orange-500/5' : ''}`}
                          style={{ width: dayWidth }}
                        />
                      );
                    })}
                  </div>

                  <div className="sticky left-0 z-20 flex h-full items-center gap-3 border-r bg-card px-3" style={{ width: LABEL_WIDTH }}>
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border bg-muted/40">
                      {item.image_urls?.[0] ? <EvidenceImage src={item.image_urls[0]} alt={`Evidencia de ${item.reference || item.title}`} className="h-full w-full rounded object-cover" /> : <SourceIcon className="h-4 w-4 text-muted-foreground" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <p className="line-clamp-2 text-sm font-semibold leading-5 text-foreground">{item.title}</p>
                        {item.historical ? <History className="mt-0.5 h-4 w-4 shrink-0 text-emerald-500" /> : null}
                      </div>
                      <p className="mt-0.5 line-clamp-2 text-xs leading-4 text-muted-foreground">
                        {item.reference || item.kind}
                        {item.owner ? ` · ${item.owner}` : ''}
                        {item.location ? ` · ${item.location}` : ''}
                      </p>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedItem(item)}
                    aria-label={`Ver detalle de ${item.title}`}
                    title={`${item.title} · ${item.status_label}`}
                    className={`absolute z-10 flex items-center overflow-hidden rounded-md border px-2 shadow-none transition-colors hover:z-20 hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-500 ${item.source === 'maintenance' ? otState(item).bar : SOURCE_META[item.source].bar} ${item.historical ? 'opacity-85' : ''}`}
                    style={{ left, width, height: BAR_HEIGHT, top: (ROW_HEIGHT - BAR_HEIGHT) / 2 }}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-semibold leading-4">{barPrimary}</p>
                      {duration > 1 ? <p className="mt-0.5 truncate text-[10px] opacity-85">{barSecondary}</p> : null}
                    </div>
                  </button>
                </div>
              );
            }) : null}

            {todayIndex >= 0 ? (
              <div
                aria-hidden="true"
                className="pointer-events-none absolute bottom-0 top-0 z-10 border-l border-orange-500/25"
                style={{ left: LABEL_WIDTH + todayIndex * dayWidth }}
              />
            ) : null}
          </div>
        </div>
      </Card>

      {selectedItem ? (
        <div className="fixed inset-0 z-50 flex justify-end bg-black/45" onMouseDown={(event) => { if (event.target === event.currentTarget) setSelectedItem(null); }}>
          <aside role="dialog" aria-modal="true" aria-label="Detalle de actividad" className="flex h-full w-full max-w-md flex-col border-l bg-background p-6 shadow-2xl" onKeyDown={(event) => { if (event.key === 'Escape') setSelectedItem(null); }}>
            <div className="flex items-start justify-between gap-4">
              <span className="text-xs font-semibold uppercase tracking-widest text-muted-foreground">{SOURCE_META[selectedItem.source].label} · {selectedItem.kind}</span>
              <Button variant="ghost" size="icon" onClick={() => setSelectedItem(null)} aria-label="Cerrar detalle"><X className="h-4 w-4" /></Button>
            </div>
            <div className="mt-6 rounded-lg border border-border bg-card p-5">
              <div className="flex items-center justify-between gap-3">
                <span className="text-xs font-semibold tracking-wide text-muted-foreground">{selectedItem.reference || selectedItem.kind}</span>
                <ExternalLink className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" aria-hidden="true" />
              </div>
              <h2 className="mt-3 text-lg font-semibold leading-snug text-foreground">{selectedItem.title}</h2>
              {selectedItem.source === 'maintenance' ? (
                <div className="mt-4 overflow-hidden rounded-md border bg-muted/30">
                  {selectedItem.image_urls?.length ? (
                    <div className="grid grid-cols-3 gap-1 p-1">
                      {selectedItem.image_urls.map((url, index) => (
                        <button key={url} type="button" onClick={() => setGalleryIndex(index)} aria-label={`Ampliar evidencia ${index + 1}`} className={`overflow-hidden rounded focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary ${index === 0 ? 'col-span-3' : ''}`}>
                          <EvidenceImage src={url} alt={`Evidencia ${index + 1} de ${selectedItem.reference || selectedItem.title}`} className={`w-full object-cover ${index === 0 ? 'h-44' : 'h-20'}`} />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className="flex h-28 flex-col items-center justify-center gap-2 text-xs text-muted-foreground"><ImageOff className="h-5 w-5" />Sin fotografías registradas</div>
                  )}
                </div>
              ) : null}
              <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                <span className={`rounded-md border px-2 py-1 font-semibold ${selectedItem.source === 'maintenance' ? otState(selectedItem).bar : SOURCE_META[selectedItem.source].bar}`}>{selectedItem.status_label}</span>
                <span className="text-muted-foreground">{formatShortDate(selectedItem.date)}</span>
              </div>
              {selectedItem.source === 'maintenance' && selectedItem.asset_name ? (
                <div className="mt-4 rounded-md border bg-muted/20 p-3 text-sm">
                  <p className="text-xs text-muted-foreground">Equipo / activo</p>
                  <p className="mt-1 font-semibold">{selectedItem.asset_name}</p>
                  {selectedItem.asset_code && selectedItem.asset_code !== selectedItem.asset_name ? <p className="mt-1 text-xs text-muted-foreground">{selectedItem.asset_code}</p> : null}
                  {selectedItem.asset_cost_center ? <p className="mt-1 text-xs text-muted-foreground">Centro de costo: {selectedItem.asset_cost_center}</p> : null}
                </div>
              ) : null}
              <div className="mt-5 grid grid-cols-2 gap-4 border-t pt-4 text-sm">
                <p><span className="text-xs text-muted-foreground">Responsable</span><span className="mt-1 block font-medium">{selectedItem.owner || 'Sin asignar'}</span></p>
                <p><span className="text-xs text-muted-foreground">Programada</span><span className="mt-1 block font-medium">{formatShortDate(selectedItem.date)}</span></p>
                {selectedItem.completed_at ? <p><span className="text-xs text-muted-foreground">Finalizada</span><span className="mt-1 block font-medium">{formatShortDate(selectedItem.completed_at)}</span></p> : null}
                {selectedItem.location ? <p><span className="text-xs text-muted-foreground">Ubicación</span><span className="mt-1 block font-medium">{selectedItem.location}</span></p> : null}
              </div>
              <Link href={selectedItem.href} className="mt-5 flex items-center justify-between border-t pt-4 text-sm font-medium text-foreground hover:underline">
                Ver OT completa <ExternalLink className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
            <p className="mt-3 text-xs leading-5 text-muted-foreground">Vista previa de solo lectura. Selecciona la ficha para abrir el registro y sus evidencias.</p>
          </aside>
          {galleryIndex !== null && selectedItem.image_urls?.[galleryIndex] ? (
            <div role="dialog" aria-modal="true" aria-label="Fotografía de evidencia ampliada" className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-black/95 p-4" onKeyDown={event => {
              if (event.key === 'Escape') setGalleryIndex(null);
              if (event.key === 'ArrowLeft') setGalleryIndex(index => index === null ? null : (index - 1 + selectedItem.image_urls!.length) % selectedItem.image_urls!.length);
              if (event.key === 'ArrowRight') setGalleryIndex(index => index === null ? null : (index + 1) % selectedItem.image_urls!.length);
            }}>
              <div className="mb-4 flex w-full max-w-5xl items-center justify-between text-white">
                <span className="text-sm">{selectedItem.reference || selectedItem.title} · Evidencia {galleryIndex + 1} de {selectedItem.image_urls.length}</span>
                <Button variant="outline" size="icon" onClick={() => setGalleryIndex(null)} aria-label="Cerrar galería"><X className="h-4 w-4" /></Button>
              </div>
              <EvidenceImage src={selectedItem.image_urls[galleryIndex]} alt={`Fotografía ${galleryIndex + 1} de ${selectedItem.reference || selectedItem.title}`} className="max-h-[75vh] max-w-full object-contain" />
              <div className="mt-4 flex gap-3">
                <Button variant="outline" onClick={() => setGalleryIndex((galleryIndex - 1 + selectedItem.image_urls!.length) % selectedItem.image_urls!.length)} aria-label="Foto anterior"><ChevronLeft className="mr-1 h-4 w-4" />Anterior</Button>
                <Button variant="outline" onClick={() => setGalleryIndex((galleryIndex + 1) % selectedItem.image_urls!.length)} aria-label="Foto siguiente">Siguiente<ChevronRight className="ml-1 h-4 w-4" /></Button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      <p className="text-xs leading-5 text-muted-foreground">
        Vista continua de solo lectura. Abre un registro para ver su detalle; usa Anterior para revisar días pasados. Las modificaciones se realizan en el módulo responsable.
      </p>
    </div>
  );
}
