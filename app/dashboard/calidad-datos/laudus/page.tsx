'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  ExternalLink,
  RefreshCw,
  ServerCog,
  ShieldAlert,
  ChevronDown,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { StatePanel } from '@/components/ui/state-panel';

type CoverageDataset = {
  key: string;
  label: string;
  table: string;
  records: number | null;
  status: 'integrated' | 'empty' | 'unavailable';
};

type SyncHealth = {
  domain: string;
  enabled: boolean;
  health_status: string;
  last_success_at: string | null;
  last_failure_at: string | null;
  next_due_at: string | null;
  records_processed: number;
  records_changed: number;
  conflicts: number;
  api_calls: number;
  consecutive_failures: number;
  last_error: string | null;
  open_incidents: number;
  critical_incidents: number;
};

type CoverageResponse = {
  generatedAt: string;
  summary: {
    totalRecords: number;
    verifiedRecords?: number;
    datasets: number;
    verifiedDatasets?: number;
    integratedDatasets: number;
    unavailableDatasets?: number;
    healthyDomains: number;
    unhealthyDomains: number;
    openIncidents: number;
  };
  datasets: CoverageDataset[];
  health: SyncHealth[];
};

type DiscoveryEndpoint = { path: string; methods: string[]; tags: string[] };
type DiscoveryDomain = { count: number; endpoints: DiscoveryEndpoint[] };
type DiscoveryResponse = {
  status: string;
  specUrl: string | null;
  capabilityCount: number;
  domains: Record<string, DiscoveryDomain>;
};

type Review = {
  status: 'open' | 'accepted' | 'resolved' | 'ignored';
  resolution_note: string | null;
  evidence_reference: string | null;
} | null;

type Issue = {
  issue_key: string;
  entity_type: string;
  issue_type: string;
  severity: 'observation' | 'warning' | 'critical';
  label: string;
  detail: string;
  href: string;
  active: boolean;
  review: Review;
};

type ReconciliationResponse = {
  counts: { active_issues: number; critical: number };
  issues: Issue[];
};

const fetcher = async <T,>(url: string): Promise<T> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la información');
  return payload as T;
};

const domainLabels: Record<string, string> = {
  master_data: 'Maestros',
  inventory: 'Inventario',
  procurement: 'Compras',
  finance: 'Finanzas',
  tax: 'Tributario',
  fixed_assets: 'Activos fijos',
  hr: 'Personas / RRHH',
  sales: 'Ventas',
  unknown: 'Otros',
};

const syncLabels: Record<string, string> = {
  products: 'Productos',
  stock: 'Stock',
  financial_masters: 'Maestros financieros',
  suppliers: 'Proveedores',
  procurement: 'Compras',
  warehouses: 'Bodegas',
  bank_statements: 'Cartolas bancarias',
  accounting_entries: 'Asientos contables',
  waybills: 'Guías de compra',
};

function formatDate(value: string | null) {
  if (!value) return 'Sin éxito registrado';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value));
}

function healthLabel(status: string) {
  if (status === 'healthy') return 'Actualizado';
  if (status === 'running') return 'Actualizando';
  if (status === 'broken') return 'Interrumpido';
  if (status === 'degraded') return 'Degradado';
  return 'Sin evidencia';
}

function datasetLabel(status: CoverageDataset['status']) {
  if (status === 'integrated') return 'En MOTIL';
  if (status === 'empty') return 'Sin registros';
  return 'No verificable';
}

function isLaudusIssue(issue: Issue) {
  const haystack = `${issue.label} ${issue.detail} ${issue.issue_type}`.toLowerCase();
  return haystack.includes('laudus')
    || ['source_conflict', 'new_external_candidate', 'external_reconciliation'].includes(issue.issue_type);
}

export default function LaudusDataQualityPage() {
  const coverage = useSWR<CoverageResponse>('/api/integrations/laudus/coverage', fetcher, { revalidateOnFocus: false });
  const discovery = useSWR<DiscoveryResponse>('/api/integrations/laudus/discovery-360', fetcher, { revalidateOnFocus: false });
  const reconciliation = useSWR<ReconciliationResponse>('/api/data-quality/reconciliation', fetcher, { revalidateOnFocus: false });
  const [query, setQuery] = useState('');
  const [issueType, setIssueType] = useState('all');

  const allLaudusIssues = useMemo(() => {
    return (reconciliation.data?.issues || [])
      .filter(isLaudusIssue)
      .filter((issue) => issue.active || issue.review?.status === 'open' || !issue.review);
  }, [reconciliation.data?.issues]);

  const laudusIssues = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return allLaudusIssues.filter((issue) => {
        if (issueType === 'critical' && issue.severity !== 'critical') return false;
        if (issueType === 'conflict' && issue.issue_type !== 'source_conflict') return false;
        if (issueType === 'candidate' && issue.issue_type !== 'new_external_candidate') return false;
        if (needle && !`${issue.label} ${issue.detail}`.toLowerCase().includes(needle)) return false;
        return true;
      });
  }, [allLaudusIssues, issueType, query]);

  const brokenSyncs = (coverage.data?.health || []).filter((row) => row.health_status !== 'healthy');
  const criticalIssues = allLaudusIssues.filter((row) => row.severity === 'critical').length;
  const loading = coverage.isLoading || discovery.isLoading || reconciliation.isLoading;
  const hasError = coverage.error || discovery.error || reconciliation.error;

  const refreshAll = async () => {
    await Promise.all([coverage.mutate(), discovery.mutate(), reconciliation.mutate()]);
  };

  return (
    <div className="space-y-6">
      <section className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Fuente Laudus</p>
          <h1 className="mt-1 text-3xl font-semibold tracking-tight">Datos y revisiones</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
            Cobertura disponible en MOTIL, estado de actualización y diferencias que requieren revisión.
          </p>
        </div>
        <Button variant="outline" onClick={() => void refreshAll()}>
          <RefreshCw className="mr-2 h-4 w-4" />Actualizar
        </Button>
      </section>

      {hasError ? (
        <StatePanel
          tone="error"
          title="Información parcial"
          description="Una de las fuentes de esta vista no respondió. Los datos confirmados siguen disponibles."
          className="min-h-0 items-start px-4 py-3 text-left [&>div:first-child]:mb-2"
        />
      ) : null}

      {loading && !coverage.data ? <StatePanel tone="loading" title="Revisando cobertura Laudus" /> : null}

      {coverage.data ? (
        <>
          <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
            {[
              ['Registros verificados', coverage.data.summary.verifiedRecords ?? coverage.data.summary.totalRecords],
              ['Cobertura verificable', `${coverage.data.summary.verifiedDatasets ?? coverage.data.summary.integratedDatasets}/${coverage.data.summary.datasets}`],
              ['Actualización', brokenSyncs.length ? `${brokenSyncs.length} por revisar` : 'Al día'],
              ['Críticas', criticalIssues],
            ].map(([label, value]) => (
              <div key={String(label)} className="bg-card p-4">
                <p className="text-2xl font-semibold">{typeof value === 'number' ? value.toLocaleString('es-CL') : value}</p>
                <p className="mt-1 text-xs text-muted-foreground">{label}</p>
              </div>
            ))}
          </section>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><Database className="h-4 w-4"/>Cobertura</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-px overflow-hidden rounded-lg border bg-border md:grid-cols-2 xl:grid-cols-3">
              {coverage.data.datasets.map((dataset) => (
                <div key={dataset.key} className="bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-medium">{dataset.label}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {dataset.records == null ? 'Conteo no disponible' : `${dataset.records.toLocaleString('es-CL')} registros`}
                      </p>
                    </div>
                    <Badge variant={dataset.status === 'integrated' ? 'secondary' : 'outline'}>{datasetLabel(dataset.status)}</Badge>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base"><ServerCog className="h-4 w-4"/>Actualización</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {coverage.data.health.map((row) => (
                <div key={row.domain} className="flex flex-col gap-3 rounded-lg border p-4 lg:flex-row lg:items-center lg:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{syncLabels[row.domain] || row.domain}</p>
                      <Badge variant={row.health_status === 'healthy' ? 'secondary' : row.health_status === 'broken' ? 'destructive' : 'outline'}>
                        {healthLabel(row.health_status)}
                      </Badge>
                      {row.conflicts > 0 ? <Badge variant="outline">{row.conflicts.toLocaleString('es-CL')} conflicto{row.conflicts === 1 ? '' : 's'}</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Última actualización: {formatDate(row.last_success_at)}
                    </p>
                    <details className="mt-2 text-xs text-muted-foreground">
                      <summary className="cursor-pointer select-none">Detalle técnico</summary>
                      <p className="mt-1">
                        Procesados {Number(row.records_processed || 0).toLocaleString('es-CL')} · Cambios {Number(row.records_changed || 0).toLocaleString('es-CL')} · API {Number(row.api_calls || 0).toLocaleString('es-CL')}
                      </p>
                    </details>
                    {row.last_error ? <p className="mt-2 text-sm text-destructive">{row.last_error}</p> : null}
                  </div>
                  {row.open_incidents > 0 ? <Badge variant="destructive">{row.open_incidents} incidente{row.open_incidents === 1 ? '' : 's'} abierto{row.open_incidents === 1 ? '' : 's'}</Badge> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      ) : null}

      {discovery.data?.status === 'ok' ? (
        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium">
            <span>Detalle técnico de la integración</span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {discovery.data.capabilityCount.toLocaleString('es-CL')} capacidades
              <ChevronDown className="h-4 w-4 transition-transform group-open:rotate-180" />
            </span>
          </summary>
          <div className="border-t px-4 py-4">
            <div className="grid gap-3 lg:grid-cols-2">
              {Object.entries(discovery.data.domains)
                .filter(([, domain]) => domain.count > 0)
                .map(([key, domain]) => (
                  <div key={key} className="rounded-md bg-muted/30 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium">{domainLabels[key] || key}</p>
                      <span className="text-xs text-muted-foreground">{domain.count}</span>
                    </div>
                    <div className="mt-2 space-y-1">
                      {domain.endpoints.slice(0, 5).map((endpoint) => (
                        <p key={endpoint.path} className="truncate font-mono text-[11px] text-muted-foreground">
                          {endpoint.methods.join('/').toUpperCase()} {endpoint.path}
                        </p>
                      ))}
                      {domain.endpoints.length > 5 ? (
                        <p className="text-xs text-muted-foreground">+{domain.endpoints.length - 5} más</p>
                      ) : null}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </details>
      ) : null}

      <Card className={criticalIssues > 0 ? 'border-destructive/30 shadow-none' : 'shadow-none'}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><ShieldAlert className="h-4 w-4"/>Revisiones</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-[1fr_220px]">
            <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar producto, proveedor, bodega o diferencia" />
            <Select value={issueType} onValueChange={setIssueType}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="critical">Críticas</SelectItem>
                <SelectItem value="conflict">Conflictos</SelectItem>
                <SelectItem value="candidate">Nuevos candidatos</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {brokenSyncs.length ? (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Integración</p>
              {brokenSyncs.map((row) => (
                <div key={`sync-${row.domain}`} className="rounded-lg border border-destructive/30 bg-destructive/5 p-4">
                  <div className="flex flex-wrap items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-destructive" />
                    <p className="font-medium">{syncLabels[row.domain] || row.domain}</p>
                    <Badge variant="destructive">{healthLabel(row.health_status)}</Badge>
                  </div>
                  <p className="mt-2 text-sm text-muted-foreground">{row.last_error || 'La fuente no tiene una sincronización saludable confirmada.'}</p>
                </div>
              ))}
            </div>
          ) : null}

          <div className="space-y-2">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Datos · {laudusIssues.length.toLocaleString('es-CL')}</p>
            {reconciliation.isLoading ? (
              <p className="text-sm text-muted-foreground">Evaluando inconsistencias…</p>
            ) : laudusIssues.length === 0 ? (
              <div className="rounded-lg border p-6 text-center text-sm text-muted-foreground">
                <CheckCircle2 className="mx-auto mb-2 h-5 w-5" />No hay inconsistencias Laudus para este filtro.
              </div>
            ) : (
              <div className="divide-y overflow-hidden rounded-lg border">
                {laudusIssues.slice(0, 500).map((issue) => (
                  <div key={issue.issue_key} className="p-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div className="min-w-0">
                        <Badge variant={issue.severity === 'critical' ? 'destructive' : 'outline'}>
                          {issue.severity === 'critical' ? 'Crítico' : 'Revisar'}
                        </Badge>
                        <p className="mt-2 font-medium">{issue.label}</p>
                        <p className="mt-1 text-sm text-muted-foreground">{issue.detail}</p>
                        {issue.review?.resolution_note ? <p className="mt-2 text-sm">Decisión registrada: {issue.review.resolution_note}</p> : null}
                      </div>
                      <Button asChild size="sm" variant="outline">
                        <Link href={issue.href}><ExternalLink className="mr-2 h-4 w-4"/>Abrir fuente</Link>
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 rounded-lg bg-muted/40 p-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm">Las diferencias se resuelven desde la conciliación con evidencia.</p>
            <Button asChild variant="outline" size="sm"><Link href="/dashboard/calidad-datos">Abrir conciliación</Link></Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
