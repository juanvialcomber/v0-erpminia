'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2, Clock3, DatabaseZap, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';

type HealthStatus = 'healthy' | 'watch' | 'critical' | 'unknown';
type Metric = { label: string; value: string | number | null; ageDays?: number | null };
type Domain = { key: string; label: string; status: HealthStatus; headline: string; metrics: Metric[]; action: string; href: string };
type HealthResponse = { overall: HealthStatus; domains: Domain[]; generatedAt: string; policy: { freshnessWatchDays: number; freshnessCriticalDays: number } };

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular la salud de datos');
  return payload as HealthResponse;
};

const labels: Record<HealthStatus, string> = { healthy: 'Confiable', watch: 'Revisar', critical: 'Crítico', unknown: 'Sin evidencia' };
const issueLabels: Record<string, string> = {
  freshness: 'Frescura de la fuente',
  negative_stock: 'Stock negativo',
  missing_asset: 'OT sin activo canónico',
};

function badgeVariant(status: HealthStatus): 'default' | 'destructive' | 'outline' | 'secondary' {
  if (status === 'critical') return 'destructive';
  if (status === 'healthy') return 'secondary';
  return 'outline';
}

function metricValue(metric: Metric) {
  if (metric.value === null || metric.value === undefined || metric.value === '') return 'Sin dato';
  if (typeof metric.value === 'number') return metric.value.toLocaleString('es-CL');
  if (/^\d{4}-\d{2}-\d{2}T/.test(metric.value)) return new Date(metric.value).toLocaleString('es-CL');
  if (/^\d{4}-\d{2}-\d{2}$/.test(metric.value)) return new Date(`${metric.value}T00:00:00`).toLocaleDateString('es-CL');
  return metric.value;
}

export default function DataHealthPage() {
  const params = useSearchParams();
  const focusDomain = params.get('domain');
  const focusIssue = params.get('issue');
  const { data, error, isLoading, mutate } = useSWR<HealthResponse>('/api/data-quality/health', fetcher, { revalidateOnFocus: false });
  const domains = data?.domains || [];
  const orderedDomains = focusDomain
    ? [...domains].sort((a, b) => Number(b.key === focusDomain) - Number(a.key === focusDomain))
    : domains;

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground">Gobierno de datos · salud transversal</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">¿Qué datos son confiables hoy?</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Resume frescura, cobertura y calidad de las fuentes operacionales autorizadas antes de usar sus indicadores para decidir.</p>
      </div>
      <div className="flex gap-2">
        <Button asChild variant="outline"><Link href="/dashboard/calidad-datos">Conciliación</Link></Button>
        <Button variant="outline" onClick={() => void mutate()}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button>
      </div>
    </section>

    {focusDomain ? <Card className="border-primary/30 shadow-none"><CardContent className="flex flex-col gap-2 p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Acción abierta desde Mis acciones</p><p className="mt-1 text-sm text-muted-foreground">Dominio: {focusDomain}{focusIssue ? ` · ${issueLabels[focusIssue] || focusIssue}` : ''}. Revisa primero esta fuente y usa el botón del dominio para corregirla en su módulo operacional.</p></div><Button asChild size="sm" variant="outline"><Link href="/dashboard/acciones">Volver a Mis acciones</Link></Button></CardContent></Card> : null}

    {error ? <StatePanel tone="error" title="No fue posible calcular Data Health" description={error.message} /> : null}
    {isLoading ? <StatePanel tone="loading" title="Evaluando fuentes canónicas" /> : null}

    {!isLoading && !error && data ? <>
      <Card className="shadow-none">
        <CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            {data.overall === 'healthy' ? <CheckCircle2 className="mt-0.5 h-5 w-5"/> : <AlertTriangle className="mt-0.5 h-5 w-5"/>}
            <div><p className="font-medium">Estado global: {labels[data.overall]}</p><p className="mt-1 text-sm text-muted-foreground">La frescura entra en revisión después de {data.policy.freshnessWatchDays} días y se considera crítica después de {data.policy.freshnessCriticalDays} días. Los umbrales sólo gobiernan confianza de datos; no son metas operacionales.</p></div>
          </div>
          <Badge variant={badgeVariant(data.overall)}>{labels[data.overall]}</Badge>
        </CardContent>
      </Card>

      <section className="grid gap-4 xl:grid-cols-2">
        {orderedDomains.map((domain) => {
          const focused = domain.key === focusDomain;
          return <Card key={domain.key} className={focused ? 'border-primary/50 shadow-none ring-1 ring-primary/20' : 'shadow-none'}>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div><CardTitle className="flex items-center gap-2 text-base"><DatabaseZap className="h-4 w-4"/>{domain.label}{focused ? <Badge variant="outline">Acción actual</Badge> : null}</CardTitle><CardDescription className="mt-2">{domain.headline}</CardDescription></div>
                <Badge variant={badgeVariant(domain.status)}>{labels[domain.status]}</Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
                {domain.metrics.map((metric) => <div key={metric.label} className="bg-card p-3">
                  <p className="text-xs text-muted-foreground">{metric.label}</p>
                  <p className="mt-1 font-medium">{metricValue(metric)}</p>
                  {typeof metric.ageDays === 'number' ? <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground"><Clock3 className="h-3 w-3"/>{metric.ageDays} día{metric.ageDays === 1 ? '' : 's'} de antigüedad</p> : null}
                </div>)}
              </div>
              <div className="flex flex-col gap-3 rounded-lg border p-3 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm">{domain.action}</p>
                <Button asChild size="sm" variant={focused ? 'default' : 'ghost'}><Link href={domain.href}>Abrir módulo<ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
              </div>
            </CardContent>
          </Card>;
        })}
      </section>

      <p className="text-xs text-muted-foreground">Generado {new Date(data.generatedAt).toLocaleString('es-CL')}. Esta vista no corrige registros ni sustituye la cola de conciliación; sólo expone la confianza operacional de cada dominio.</p>
    </> : null}
  </div>;
}
