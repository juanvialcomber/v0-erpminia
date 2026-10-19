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
  if (row.emailReportedStatus) return \`Reportado: \${row.emailReportedStatus}\`;
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

export default function MaintenanceControlTowerPage() {
  const { data, error, isLoading } = useSWR('/api/maintenance/control-tower', fetcher, {
    refreshInterval: 60_000,
    revalidateOnFocus: true,
  });
  const [pageIndex, setPageIndex] = useState(0);
  const pageSize = 9;

  const rows = Array.isArray(data?.rows) ? data.rows : [];
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));

  useEffect(() => {
    setPageIndex((current) => Math.min(current, totalPages - 1));
  }, [totalPages]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setPageIndex((current) => (current + 1) % totalPages);
    }, 15_000);
    return () => window.clearInterval(timer);
  }, [totalPages]);

  const visibleRows = useMemo(
    () => rows.slice(pageIndex * pageSize, pageIndex * pageSize + pageSize),
    [rows, pageIndex],
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
    <div className="mx-auto w-full max-w-[1900px] space-y-5 pb-2">
      <header className="grid gap-4 border-b pb-4 lg:grid-cols-[1fr_auto] lg:items-end">
        <div>
          <div className="mb-2 flex flex-wrap items-center gap-2 text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            <Monitor className="h-4 w-4" />
            Mantenimiento · visualización permanente
            <Badge variant="outline">Solo lectura</Badge>
          </div>
          <h1 className="text-3xl font-semibold tracking-tight">Torre de Control</h1>
          <p className="mt-1 max-w-4xl text-sm text-muted-foreground">
            Maestro vivo alimentado por estado canónico, planificación, correos de La Patagua, WhatsApp y órdenes de trabajo.
          </p>
        </div>
        <div className="grid gap-1 text-right text-xs text-muted-foreground">
          <span>Correo: {dateTime(freshness.latestEmailAt)}</span>
          <span>WhatsApp: {dateTime(freshness.latestWhatsAppAt)}</span>
          <span>Pantalla actualizada: {dateTime(data?.generatedAt)}</span>
        </div>
      </header>

      {pendingEmailMatches > 0 ? (
        <div className="flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 px-4 py-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="font-semibold">{pendingEmailMatches} registro{pendingEmailMatches === 1 ? '' : 's'} de correo pendiente{pendingEmailMatches === 1 ? '' : 's'} de vincular</p>
            <p className="text-sm text-muted-foreground">
              La evidencia fue incorporada, pero no se atribuye a un equipo hasta tener una coincidencia confiable.
            </p>
          </div>
        </div>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-4" aria-label="Resumen operacional">
        <Metric icon={Gauge} label="Equipos activos" value={summary.activeAssets} detail="Maestro canónico" />
        <Metric icon={AlertTriangle} label="P1 + P2" value={summary.urgent} detail={\`\${summary.p1 || 0} P1 · \${summary.p2 || 0} P2\`} />
        <Metric icon={Wrench} label="OT abiertas" value={summary.openWorkOrders} detail="Ejecución vigente" />
        <Metric icon={Radio} label="Evidencia por vincular" value={summary.pendingEmailMatches} detail="Correo recibido" />
      </section>

      <Card className="overflow-hidden shadow-none">
        <CardContent className="p-0">
          <div className="grid grid-cols-[88px_minmax(220px,1.2fr)_120px_150px_130px_180px_minmax(260px,1.4fr)] gap-3 border-b bg-muted/35 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
            <span>Prioridad</span>
            <span>Equipo</span>
            <span>Faena</span>
            <span>Estado</span>
            <span>Medidor / MP</span>
            <span>Programación</span>
            <span>Última señal</span>
          </div>
          <div className="divide-y">
            {visibleRows.map((row: any) => (
              <div
                key={row.canonicalAssetId}
                className={cn(
                  'grid min-h-[78px] grid-cols-[88px_minmax(220px,1.2fr)_120px_150px_130px_180px_minmax(260px,1.4fr)] gap-3 px-4 py-3 text-sm',
                  row.priorityRank === 1 ? 'bg-destructive/[0.035]' : '',
                )}
              >
                <div className="flex items-start">
                  <Badge variant={priorityVariant(row.priorityRank)}>
                    {row.planningPriority || 'Sin P'}
                  </Badge>
                </div>

                <div className="min-w-0">
                  <p className="truncate font-semibold">{row.assetName}</p>
                  <p className="truncate text-xs text-muted-foreground">{row.assetCode || 'Sin código'}</p>
                  {Number(row.openWorkOrders || 0) > 0 ? (
                    <p className="mt-1 text-xs font-medium">{row.openWorkOrders} OT abierta{row.openWorkOrders === 1 ? '' : 's'}</p>
                  ) : null}
                </div>

                <div>
                  <p className="font-medium">{row.site}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{evidenceLabel(row.latestSignalSource)}</p>
                </div>

                <div>
                  <p className="font-medium">{statusText(row)}</p>
                  {row.emailReportedMpStatus ? <p className="mt-1 text-xs text-muted-foreground">MP: {row.emailReportedMpStatus}</p> : null}
                </div>

                <div className="tabular-nums">
                  <p className="font-medium">
                    {number(row.emailMeterValue ?? row.planningCurrentReading)} {row.emailMeterUnit || row.planningMeterUnit || ''}
                  </p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Próx. {number(row.planningNextDueMeter)} · resta {number(row.planningRemainingMeter)}
                  </p>
                </div>

                <div>
                  <p className="font-medium">{row.programmingStatus || 'Sin programación'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{row.responsible || 'Sin responsable'}</p>
                  {row.partsStatus ? <p className="text-xs text-muted-foreground">Rep.: {row.partsStatus}</p> : null}
                </div>

                <div className="min-w-0">
                  <p className="line-clamp-2 font-medium">{evidenceText(row)}</p>
                  <p className="mt-1 truncate text-xs text-muted-foreground">
                    {evidenceLabel(row.latestSignalSource)} · {dateTime(row.latestSignalAt)}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <footer className="flex items-center justify-between gap-4 border-t pt-3 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Clock3 className="h-3.5 w-3.5" />
          Actualización automática cada {data?.refreshSeconds || 60} s · rotación cada 15 s
        </div>
        <div>Página {pageIndex + 1} de {totalPages} · {rows.length} equipos</div>
      </footer>
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
