'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertCircle, AlertTriangle, Clock, Info, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { FilterToolbar, FilterToolbarActions, FilterToolbarGroup } from '@/components/ui/filter-toolbar';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

type AlertSeverity = 'critica' | 'alta' | 'media' | 'baja' | 'info';
type AlertType = 'documento' | 'mantenimiento' | 'inventario' | 'sostenibilidad' | 'contrato';
type Alert = {
  id: string;
  title: string;
  description: string;
  severity: AlertSeverity;
  type: AlertType;
  timestamp: string | null;
  actionRequired: boolean;
  actionUrl: string;
  actionLabel?: string;
};
type AlertResponse = {
  alerts?: Alert[];
  stats?: { total: number; critical: number; actionRequired: number };
  sourceStatus?: { available: number; total: number; complete: boolean; unavailable: string[] };
};

const fetcher = async (url: string): Promise<AlertResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar las alertas');
  return payload || {};
};

const severityConfig = {
  critica: { variant: 'destructive' as const, icon: AlertTriangle, label: 'Crítica' },
  alta: { variant: 'default' as const, icon: AlertCircle, label: 'Alta' },
  media: { variant: 'default' as const, icon: AlertCircle, label: 'Media' },
  baja: { variant: 'outline' as const, icon: Info, label: 'Baja' },
  info: { variant: 'outline' as const, icon: Info, label: 'Info' },
};

function typeLabel(type: AlertType) {
  const labels: Record<AlertType, string> = {
    documento: 'Documentos',
    mantenimiento: 'Mantenimiento',
    inventario: 'Bodega',
    sostenibilidad: 'Sostenibilidad',
    contrato: 'Legal',
  };
  return labels[type];
}

function defaultActionLabel(type: AlertType) {
  if (type === 'mantenimiento') return 'Resolver OT';
  if (type === 'inventario') return 'Revisar stock';
  if (type === 'sostenibilidad') return 'Resolver';
  if (type === 'contrato') return 'Revisar contrato';
  return 'Revisar documento';
}

function formatTime(timestamp: string | null) {
  if (!timestamp) return 'Fecha fuente no disponible';
  const date = new Date(timestamp);
  return Number.isNaN(date.getTime())
    ? 'Fecha fuente no disponible'
    : date.toLocaleString('es-CL', { dateStyle: 'medium', timeStyle: 'short' });
}

export default function AlertasPage() {
  const [filter, setFilter] = useState<'todos' | 'criticas' | 'accion'>('todos');
  const { data, error, isLoading, isValidating, mutate } = useSWR<AlertResponse>('/api/alertas', fetcher, {
    revalidateOnFocus: false,
  });

  const alerts = data?.alerts ?? [];
  const sourceStatus = data?.sourceStatus;
  const complete = sourceStatus?.complete === true;
  const filteredAlerts = useMemo(
    () => alerts.filter((alert) => {
      if (filter === 'criticas') return alert.severity === 'critica';
      if (filter === 'accion') return alert.actionRequired;
      return true;
    }),
    [alerts, filter],
  );

  const criticalCount = alerts.filter((alert) => alert.severity === 'critica').length;
  const actionCount = alerts.filter((alert) => alert.actionRequired).length;
  const aggregateUnavailable = isLoading || Boolean(error) || !sourceStatus || !complete;
  const aggregateValue = (value: number) => aggregateUnavailable ? '—' : value;
  const sourceValue = sourceStatus ? `${sourceStatus.available}/${sourceStatus.total}` : '—';

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Control transversal · señales</PageHeaderEyebrow>
          <PageHeaderTitle>Centro de alertas</PageHeaderTitle>
          <PageHeaderDescription>
            Señales detectadas en mantenimiento, abastecimiento, sostenibilidad, documentos y contratos. Una señal no reemplaza el ciclo de gestión de un problema en Andon.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button variant="outline" onClick={() => void mutate()} disabled={isValidating}>
            <RefreshCw className={`h-4 w-4 ${isValidating ? 'animate-spin' : ''}`} />
            Actualizar
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <div className="grid divide-y rounded-lg border border-border bg-card sm:grid-cols-3 sm:divide-x sm:divide-y-0">
        {[
          ['Fuentes disponibles', sourceValue, complete ? 'Cobertura completa' : 'Revisar cobertura'],
          ['Críticas', aggregateValue(criticalCount), aggregateUnavailable ? 'Agregado no concluyente' : 'Atención inmediata'],
          ['Con acción', aggregateValue(actionCount), aggregateUnavailable ? 'Agregado no concluyente' : 'Seguimiento pendiente'],
        ].map(([label, value, detail]) => (
          <div key={String(label)} className="px-5 py-4">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tracking-tight">{value}</p>
            <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
          </div>
        ))}
      </div>

      {sourceStatus && !sourceStatus.complete ? (
        <StatePanel
          tone="warning"
          title="Vista parcial de señales"
          description={`No respondieron: ${sourceStatus.unavailable.join(', ')}. Las señales disponibles se mantienen visibles, pero los totales no se presentan como completos.`}
          actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>}
          className="min-h-0"
        />
      ) : null}

      <FilterToolbar>
        <FilterToolbarGroup>
          <p className="text-sm text-muted-foreground">{filteredAlerts.length} señales visibles{complete ? '' : ' entre las fuentes disponibles'}</p>
        </FilterToolbarGroup>
        <FilterToolbarActions>
          <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)}>
            <TabsList>
              <TabsTrigger value="todos">Todas</TabsTrigger>
              <TabsTrigger value="criticas">Críticas</TabsTrigger>
              <TabsTrigger value="accion">Con acción</TabsTrigger>
            </TabsList>
          </Tabs>
        </FilterToolbarActions>
      </FilterToolbar>

      {isLoading ? <StatePanel tone="loading" title="Cargando señales" description="Consultando las fuentes operacionales." /> : null}
      {error ? (
        <StatePanel
          tone="error"
          title="No fue posible cargar las señales"
          description={error.message}
          actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>}
        />
      ) : null}
      {!isLoading && !error && filteredAlerts.length === 0 ? (
        <StatePanel
          tone="neutral"
          title={complete ? 'No hay señales para este filtro' : 'No hay señales entre las fuentes disponibles'}
          description={complete ? 'No existen registros que coincidan con la vista seleccionada.' : 'La cobertura está incompleta; este estado no equivale a ausencia global de señales.'}
        />
      ) : null}

      {!isLoading && !error && filteredAlerts.length > 0 ? (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <div className="divide-y divide-border">
            {filteredAlerts.map((alert) => {
              const config = severityConfig[alert.severity];
              const Icon = config.icon;
              return (
                <article key={alert.id} className="grid gap-4 px-4 py-4 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center lg:px-5">
                  <div className="flex min-w-0 gap-3">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-muted">
                      <Icon className={`h-4 w-4 ${alert.severity === 'critica' ? 'text-destructive' : 'text-muted-foreground'}`} />
                    </div>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <h2 className="text-sm font-semibold leading-6">{alert.title}</h2>
                        <Badge variant={config.variant}>{config.label}</Badge>
                        <Badge variant="outline">{typeLabel(alert.type)}</Badge>
                      </div>
                      <p className="mt-1 text-sm leading-6 text-muted-foreground">{alert.description}</p>
                      <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><Clock className="h-3.5 w-3.5" />{formatTime(alert.timestamp)}</span>
                        {alert.actionRequired ? <span>Requiere acción</span> : null}
                      </div>
                    </div>
                  </div>
                  <Button size="sm" asChild><Link href={alert.actionUrl}>{alert.actionLabel || defaultActionLabel(alert.type)}</Link></Button>
                </article>
              );
            })}
          </div>
        </div>
      ) : null}
    </div>
  );
}
