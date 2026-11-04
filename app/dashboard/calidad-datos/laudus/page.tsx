'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2, DatabaseZap, RefreshCw, ShieldAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type Severity = 'critical' | 'warning' | 'observation';
type Kind = 'integration_error' | 'data_inconsistency' | 'reconciliation_pending';
type Issue = {
  key: string;
  area: string;
  kind: Kind;
  severity: Severity;
  count: number;
  title: string;
  detail: string;
  href: string;
  observedAt?: string | null;
};
type Payload = {
  generatedAt: string;
  summary: {
    categories: number;
    totalSignals: number;
    critical: number;
    integrationErrors: number;
    inconsistencies: number;
    reconciliationPending: number;
    healthyDomains: number;
    totalDomains: number;
  };
  issues: Issue[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron consolidar las incidencias Laudus.');
  return payload;
};

const kindLabel: Record<Kind, string> = {
  integration_error: 'Integración',
  data_inconsistency: 'Inconsistencia',
  reconciliation_pending: 'Pendiente',
};

const severityLabel: Record<Severity, string> = {
  critical: 'Crítico',
  warning: 'Revisar',
  observation: 'Pendiente',
};

export default function LaudusIssuesPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/integrations/laudus/issues', fetcher, { revalidateOnFocus: false });

  return <div className="mx-auto w-full max-w-[1500px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Datos · Laudus</PageHeaderEyebrow>
        <PageHeaderTitle>Incidencias Laudus</PageHeaderTitle>
        <PageHeaderDescription>Un solo lugar para errores de integración, inconsistencias de datos y conciliaciones pendientes. Los hechos normales de negocio no se cuentan como error.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button variant="outline" onClick={() => void mutate()}><RefreshCw className="h-4 w-4"/>Actualizar</Button>
      </PageHeaderActions>
    </PageHeader>

    <section aria-label="Resumen incidencias Laudus" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Críticos', data?.summary.critical ?? '—', 'Prioridad inmediata'],
        ['Integración', data?.summary.integrationErrors ?? '—', 'Sync o acceso'],
        ['Inconsistencias', data?.summary.inconsistencies ?? '—', 'Datos a revisar'],
        ['Pendientes', data?.summary.reconciliationPending ?? '—', 'Conciliación humana'],
        ['Dominios', data ? `${data.summary.healthyDomains}/${data.summary.totalDomains}` : '—', 'Healthy'],
      ].map(([label, value, detail]) => <div key={String(label)} className="bg-card p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-3xl font-semibold tabular-nums">{isLoading ? '—' : value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
      </div>)}
    </section>

    {error ? <StatePanel tone="error" title="No se pudieron cargar las incidencias Laudus" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5"/> : null}

    {!isLoading && !error && (data?.issues.length || 0) === 0 ? <StatePanel
      tone="neutral"
      title="Sin incidencias Laudus activas"
      description="No hay errores, inconsistencias ni conciliaciones pendientes detectadas por las fuentes actuales."
      className="min-h-0 py-8"
    /> : null}

    {!isLoading && !error && data?.issues.length ? <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="text-lg">Qué requiere revisión</CardTitle>
        <CardDescription>La misma evidencia queda en su módulo de origen; esta vista sólo consolida y prioriza.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        <div className="divide-y">
          {data.issues.map((issue) => <div key={issue.key} className="grid gap-4 p-4 lg:grid-cols-[1fr_auto] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                {issue.severity === 'critical' ? <ShieldAlert className="h-4 w-4 text-destructive"/> : issue.kind === 'integration_error' ? <DatabaseZap className="h-4 w-4 text-amber-600"/> : <AlertTriangle className="h-4 w-4 text-muted-foreground"/>}
                <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'}>{severityLabel[issue.severity]}</Badge>
                <Badge variant="secondary">{kindLabel[issue.kind]}</Badge>
                <Badge variant="outline">{issue.area}</Badge>
              </div>
              <div className="mt-2 flex flex-wrap items-baseline gap-2">
                <p className="font-medium">{issue.title}</p>
                <span className="text-sm font-semibold tabular-nums">{issue.count.toLocaleString('es-CL')}</span>
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{issue.detail}</p>
            </div>
            <Button asChild size="sm" variant="outline"><Link href={issue.href}>Revisar<ArrowRight className="h-4 w-4"/></Link></Button>
          </div>)}
        </div>
      </CardContent>
    </Card> : null}

    <div className="grid gap-3 md:grid-cols-3">
      <div className="rounded-lg border p-4"><CheckCircle2 className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">No corrige solo</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Registrar una incidencia no modifica Laudus ni MOTIL.</p></div>
      <div className="rounded-lg border p-4"><DatabaseZap className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Una sola cola</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Stock, maestros, activos y sync se consolidan aquí; el detalle permanece en el módulo responsable.</p></div>
      <div className="rounded-lg border p-4"><AlertTriangle className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Sin falsos errores</p><p className="mt-1 text-xs leading-5 text-muted-foreground">Una factura impaga o una CxP abierta es negocio normal; sólo aparece aquí cuando existe inconsistencia o falla de integración.</p></div>
    </div>
  </div>;
}
