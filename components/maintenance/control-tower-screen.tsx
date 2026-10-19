'use client';

import { useEffect, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Clock3, Gauge, Monitor, Radio, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { cn } from '@/lib/utils';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la Torre de Control');
  return payload;
};

const number = (value: unknown) => value == null
  ? '—'
  : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value));

const dateTime = (value: unknown) => {
  if (!value) return 'Sin actualización';
  const parsed = new Date(String(value));
  if (Number.isNaN(parsed.getTime())) return 'Sin actualización';
  return parsed.toLocaleString('es-CL', { dateStyle: 'short', timeStyle: 'short' });
};

function priorityVariant(rank: number) {
  if (rank === 1) return 'destructive' as const;
  if (rank === 2) return 'secondary' as const;
  return 'outline' as const;
}

function evidenceLabel(source: string | null | undefined) {
  if (source === 'email') return 'Correo';
  if (source === 'whatsapp') return 'WhatsApp';
  if (source === 'canonical_status') return 'Estado validado';
  if (source === 'planning_master') return 'Planificación';
  return 'Maestro de activos';
}

function statusText(row: any) {
  if (row.canonicalStatus) return row.canonicalStatus;
  if (row.emailReportedStatus) return `Reportado: ${row.emailReportedStatus}`;
  if (row.whatsappDescription) return 'Señal operacional';
  return 'Sin estado validado';
}

function evidenceText(row: any) {
  if (row.latestSignalSource === 'email') {
    return row.emailIssue || row.emailWork || row.emailReportedStatus || row.emailSubject || 'Actualización por correo';
  }
  if (row.latestSignalSource === 'whatsapp') {
    return row.whatsappDescription || 'Actualización por WhatsApp';
  }
  if (row.canonicalStatusReason) return row.canonicalStatusReason;
  return row.recommendedAction || row.planningObservations || 'Sin novedades registradas';
}

function signalAge(hours: unknown) {
  const value = Number(hours);
  if (!Number.isFinite(value)) return 'sin fecha';
  if (value < 1) return 'ahora';
  if (value < 24) return `hace ${value} h`;
  return `hace ${Math.floor(value / 24)} d`;
}

export default function MaintenanceControlTowerPage() {
  const { data, error, isLoading } = useSWR('/api/maintenance/control-tower', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 6;

  const attentionRows = Array.isArray(data?.attentionRows) ? data.attentionRows : [];
  const fleetRows = Array.isArray(data?.fleetRows) ? data.fleetRows : [];
  const recentSignals = Array.isArray(data?.recentSignals) ? data.recentSignals : [];
  const totalPages = Math.max(1, Math.ceil(fleetRows.length / pageSize));

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (media.matches) return;
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % totalPages);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [totalPages]);

  const visibleFleetRows = useMemo(
    () => fleetRows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [fleetRows, pageIndex],
  );

  if (isLoading) {
    return <div className="min-h-[70vh]"><StatePanel tone="loading" title="Cargando Torre de Control" className="min-h-[70vh]" /></div>;
  }

  if (error) {
    return <div className="min-h-[70vh]"><StatePanel tone="error" title="No se pudo cargar la Torre de Control" description={error.message} className="min-h-[70vh]" /></div>;
  }

  const summary = data?.summary || {};
  const freshness = data?.freshness || {};
  const pendingEmailMatches = Number(summary.pendingEmailMatches || 0);

  return (
    <div className="mx-auto w-full max-w-[1900px] space-y-4 pb-2">
      <header className="grid gap-4 border-b pb-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Monitor className="h-4 w-4" />
            Mantenimiento · pantalla permanente
            <Badge variant="outline">Solo lectura</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Torre de Control</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Estado validado, planificación y evidencia nueva de correo/WhatsApp en una sola vista operacional.
          </p>
        </div>
        <div className="grid gap-1 text-right text-xs text-muted-foreground">
          <span>Correo: {dateTime(freshness.latestEmailAt)}</span>
          <span>WhatsApp: {dateTime(freshness.latestWhatsAppAt)}</span>
          <span>Pantalla: {dateTime(data?.generatedAt)}</span>
        </div>
      </header>

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4" aria-label="Resumen operacional">
        <Metric icon={AlertTriangle} label="Atención ahora" value={summary.attentionAssets} detail={`${summary.p1 || 0} P1 · ${summary.p2 || 0} P2`} />
        <Metric icon={Wrench} label="OT abiertas" value={summary.openWorkOrders} detail="Ejecución vigente" />
        <Metric icon={Gauge} label="Equipos activos" value={summary.activeAssets} detail="Maestro canónico" />
        <Metric icon={Radio} label="Evidencia por vincular" value={summary.pendingEmailMatches} detail="Revisión humana" />
      </section>

      {pendingEmailMatches > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">{pendingEmailMatches} evidencia{pendingEmailMatches === 1 ? '' : 's'} sin vínculo confiable a equipo</p>
            <p className="text-sm text-muted-foreground">Se conserva la fuente, pero no modifica el estado de un activo hasta resolver la identidad.</p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,.65fr)]">
        <Card className="overflow-hidden shadow-none">
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
              <div>
                <p className="text-sm font-semibold">Atención ahora</p>
                <p className="text-xs text-muted-foreground">P1, P2 y equipos con OT abierta permanecen fijos.</p>
              </div>
              <Badge variant={attentionRows.length > 0 ? 'destructive' : 'outline'}>{attentionRows.length}</Badge>
            </div>

            {attentionRows.length === 0 ? (
              <div className="p-8 text-center text-sm text-muted-foreground">Sin equipos en atención prioritaria.</div>
            ) : (
              <div className="grid gap-px bg-border md:grid-cols-2">
                {attentionRows.slice(0, 6).map((row: any) => (
                  <AssetCard key={row.canonicalAssetId} row={row} critical />
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="overflow-hidden shadow-none">
          <CardContent className="p-0">
            <div className="border-b bg-muted/30 px-4 py-3">
              <p className="text-sm font-semibold">Cambios recientes</p>
              <p className="text-xs text-muted-foreground">Qué cambió, en qué equipo y desde qué fuente.</p>
            </div>
            <div className="divide-y">
              {recentSignals.slice(0, 6).map((signal: any) => (
                <div key={`${signal.canonicalAssetId}-${signal.at}-${signal.source}`} className="space-y-1 px-4 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="truncate text-sm font-semibold">{signal.assetName}</p>
                    <Badge variant="outline">{evidenceLabel(signal.source)}</Badge>
                  </div>
                  <p className="line-clamp-2 text-sm">{signal.text || 'Actualización registrada'}</p>
                  <p className="text-xs text-muted-foreground">{signal.site || 'Sin faena'} · {dateTime(signal.at)}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </section>

      <Card className="overflow-hidden shadow-none">
        <CardContent className="p-0">
          <div className="flex items-center justify-between border-b bg-muted/30 px-4 py-3">
            <div>
              <p className="text-sm font-semibold">Resto de la flota</p>
              <p className="text-xs text-muted-foreground">La rotación automática afecta sólo a equipos sin atención prioritaria.</p>
            </div>
            <p className="text-xs text-muted-foreground">Página {pageIndex + 1} de {totalPages}</p>
          </div>
          <div className="grid gap-px bg-border md:grid-cols-2 xl:grid-cols-3">
            {visibleFleetRows.map((row: any) => (
              <AssetCard key={row.canonicalAssetId} row={row} />
            ))}
          </div>
        </CardContent>
      </Card>

      <footer className="flex items-center justify-between gap-4 border-t pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5" />
          Refresco cada {data?.refreshSeconds || 60} s · rotación no crítica cada 15 s
        </div>
        <div>{fleetRows.length} equipos fuera de atención prioritaria</div>
      </footer>
    </div>
  );
}

function AssetCard({ row, critical = false }: { row: any; critical?: boolean }) {
  return (
    <div className={cn('bg-card p-4', critical && row.priorityRank === 1 ? 'bg-destructive/[0.035]' : '')}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-base font-semibold">{row.assetName}</p>
          <p className="truncate text-xs text-muted-foreground">{row.site} · {row.assetCode || 'sin código'}</p>
        </div>
        <Badge variant={priorityVariant(row.priorityRank)}>{row.planningPriority || 'Sin P'}</Badge>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Estado validado</p>
          <p className="mt-1 font-medium">{statusText(row)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Medidor / próximo MP</p>
          <p className="mt-1 font-medium tabular-nums">
            {number(row.emailMeterValue ?? row.planningCurrentReading)} {row.emailMeterUnit || row.planningMeterUnit || ''}
          </p>
          <p className="text-xs text-muted-foreground">Próx. {number(row.planningNextDueMeter)} · resta {number(row.planningRemainingMeter)}</p>
        </div>
      </div>

      <div className="mt-3 rounded-md border bg-muted/20 px-3 py-2">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">Última señal</p>
          <p className="text-xs text-muted-foreground">{evidenceLabel(row.latestSignalSource)} · {signalAge(row.latestSignalAgeHours)}</p>
        </div>
        <p className="mt-1 line-clamp-2 text-sm font-medium">{evidenceText(row)}</p>
      </div>

      {critical && row.recommendedAction ? (
        <div className="mt-3 border-l-2 border-primary/40 pl-3">
          <p className="text-[11px] uppercase tracking-[0.1em] text-muted-foreground">Siguiente acción</p>
          <p className="mt-1 text-sm font-medium">{row.recommendedAction}</p>
        </div>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
        <span>{row.programmingStatus || 'Sin programación'}</span>
        <span>{row.responsible || 'Sin responsable'}</span>
        {row.partsStatus ? <span>Rep.: {row.partsStatus}</span> : null}
        {Number(row.openWorkOrders || 0) > 0 ? <span className="font-semibold text-foreground">{row.openWorkOrders} OT abierta{row.openWorkOrders === 1 ? '' : 's'}</span> : null}
      </div>
    </div>
  );
}

function Metric({ icon: Icon, label, value, detail }: { icon: any; label: string; value: unknown; detail: string }) {
  return (
    <div className="bg-card px-5 py-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span>{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-3">
        <p className="text-3xl font-semibold tracking-tight tabular-nums">{value == null ? '—' : number(value)}</p>
        <p className="text-right text-xs text-muted-foreground">{detail}</p>
      </div>
    </div>
  );
}
