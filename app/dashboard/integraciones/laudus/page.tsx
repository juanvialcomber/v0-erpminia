'use client';

import useSWR from 'swr';
import { AlertTriangle, ArrowLeft, CheckCircle2, Clock3, Database, RefreshCw } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type DomainState = 'updated' | 'review' | 'stale' | 'manual';
type Domain = {
  key: string;
  label: string;
  state: DomainState;
  rows: number;
  updatedAt: string | null;
  detail: string;
  automated: boolean;
};

type Payload = {
  status: 'healthy' | 'review' | 'offline';
  headline: string;
  summary: { connected: boolean; current: number; total: number; manual: number; attention: number };
  sourceUpdatedAt: string | null;
  domains: Domain[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible verificar Laudus.');
  return payload;
};

const STATE: Record<DomainState, { label: string; variant: 'secondary' | 'outline' | 'destructive' }> = {
  updated: { label: 'Actualizado', variant: 'secondary' },
  manual: { label: 'Disponible', variant: 'outline' },
  stale: { label: 'Actualizar', variant: 'outline' },
  review: { label: 'Revisar', variant: 'destructive' },
};

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(parsed);
}

function number(value: number) {
  return new Intl.NumberFormat('es-CL').format(value);
}

export default function LaudusStatusPage() {
  const { data, error, isLoading, mutate } = useSWR<Payload>('/api/integrations/laudus/status', fetcher, {
    refreshInterval: 60000,
    revalidateOnFocus: false,
  });

  const healthy = data?.status === 'healthy';

  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Integraciones</PageHeaderEyebrow>
        <div className="flex items-center gap-3">
          <LaudusSourceMark state={healthy ? 'connected' : data?.status === 'offline' ? 'offline' : 'review'} />
          <PageHeaderTitle>Laudus</PageHeaderTitle>
        </div>
        <PageHeaderDescription>Qué información está al día, qué requiere revisión y qué se actualiza automáticamente.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button variant="outline" asChild><Link href="/dashboard"><ArrowLeft className="h-4 w-4" />Volver</Link></Button>
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className={isLoading ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Actualizar estado</Button>
      </PageHeaderActions>
    </PageHeader>

    {error ? <StatePanel tone="error" title="No fue posible verificar Laudus" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} /> : null}
    {isLoading && !data ? <StatePanel tone="loading" title="Verificando Laudus" description="Consultando el estado real de las áreas conectadas." /> : null}

    {data ? <>
      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-md border bg-background">
              {data.status === 'healthy' ? <CheckCircle2 className="h-5 w-5" /> : data.status === 'offline' ? <Database className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado general</p>
              <h2 className="mt-1 text-xl font-semibold">{data.headline}</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {data.summary.current} de {data.summary.total} áreas están actualizadas automáticamente.
                {data.summary.manual > 0 ? ` ${data.summary.manual} áreas siguen disponibles como referencia y requieren un ciclo periódico.` : ''}
              </p>
            </div>
          </div>
          <div className="text-sm text-muted-foreground">Última actividad {formatDate(data.sourceUpdatedAt)}</div>
        </CardContent>
      </Card>

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="shadow-none"><CardContent className="p-4"><p className="text-sm text-muted-foreground">Actualizadas</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.summary.current}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-4"><p className="text-sm text-muted-foreground">Disponibles sin ciclo automático</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.summary.manual}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-4"><p className="text-sm text-muted-foreground">Requieren atención</p><p className="mt-1 text-2xl font-semibold tabular-nums">{data.summary.attention}</p></CardContent></Card>
      </div>

      <Card className="overflow-hidden shadow-none">
        <CardHeader className="border-b"><CardTitle>Áreas conectadas</CardTitle></CardHeader>
        <CardContent className="p-0">
          <div className="hidden grid-cols-[1.2fr_120px_130px_160px_1.8fr] gap-4 border-b bg-muted/40 px-5 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground md:grid">
            <span>Área</span><span>Estado</span><span>Registros</span><span>Última actualización</span><span>Lectura</span>
          </div>
          {data.domains.map((domain) => {
            const state = STATE[domain.state];
            return <div key={domain.key} className="grid gap-2 border-b px-5 py-4 last:border-0 md:grid-cols-[1.2fr_120px_130px_160px_1.8fr] md:items-center md:gap-4">
              <div><p className="font-medium">{domain.label}</p><p className="mt-0.5 text-xs text-muted-foreground">{domain.automated ? 'Actualización automática' : 'Referencia disponible'}</p></div>
              <div><Badge variant={state.variant}>{state.label}</Badge></div>
              <p className="text-sm font-medium tabular-nums">{number(domain.rows)}</p>
              <p className="text-sm text-muted-foreground">{formatDate(domain.updatedAt)}</p>
              <p className="text-sm text-muted-foreground">{domain.detail}</p>
            </div>;
          })}
        </CardContent>
      </Card>

      <div className="flex items-start gap-3 rounded-lg border bg-muted/20 p-4 text-sm">
        <Clock3 className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div><p className="font-medium">Regla de operación</p><p className="mt-1 text-muted-foreground">MOTIL no reemplaza silenciosamente información operacional por datos Laudus. Cuando dos fuentes difieren, la diferencia queda visible hasta ser conciliada.</p></div>
      </div>
    </> : null}
  </div>;
}
