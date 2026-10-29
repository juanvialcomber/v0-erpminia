'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, BadgeCheck } from 'lucide-react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type PriorityDecisionSummary = {
  total?: number;
  accepted?: number;
  deferred?: number;
  rejected?: number;
  timedDecisions?: number;
  medianDecisionSeconds?: number | null;
  latestAt?: string | null;
};

type FinanceBaselineSummary = {
  sampleCount?: number;
  medianSecondsPerCase?: number | null;
  latestAt?: string | null;
};

type FinanceControl = {
  readOnly?: boolean;
  payments?: {
    total?: number;
    deposited?: number;
    pendingDeposit?: number;
    latestSync?: string | null;
    actionRequired?: boolean;
    pendingItems?: Array<{
      externalId?: string;
      issuedDate?: string | null;
      dueDate?: string | null;
      document?: string | null;
      notes?: string | null;
      bankName?: string | null;
      invoiceAmount?: number | null;
      currency?: string | null;
    }>;
  };
  accountsPayable?: {
    openItems?: number;
    overdueItems?: number;
    dueWithin7Days?: number;
    openAmountClp?: number;
    overdueAmountClp?: number;
    dueSoonAmountClp?: number;
    newOpenIssued7d?: number;
    becameOverdue7d?: number;
    aging?: Array<{ label: string; items: number; amountClp: number }>;
    dueByMonth?: Array<{ key: string; label: string; items: number; amountClp: number }>;
    topSuppliers?: Array<{ supplierId: string; supplierName: string; items: number; amountClp: number; sharePct: number }>;
    severeAgingSharePct?: number;
    topSupplierSharePct?: number;
    historicalTrendAvailable?: boolean;
    latestSync?: string | null;
    oldestOpenItems?: Array<{
      externalId?: string;
      supplierName?: string;
      documentNumber?: string | null;
      issuedDate?: string | null;
      dueDate?: string | null;
      outstandingAmount?: number;
      currency?: string | null;
      status?: string | null;
    }>;
    semantics?: string;
  };
  creditNotes?: {
    total?: number;
    documentedAmount?: number;
    latestSync?: string | null;
    semantics?: string;
  };
  costCenters?: {
    total?: number;
    matched?: number;
    ignored?: number;
    pending?: number;
    candidate?: number;
    conflict?: number;
    unresolved?: number;
    discontinued?: number;
    latestSync?: string | null;
    reconciliationRequired?: boolean;
    semantics?: string;
  };
  accounting?: {
    entries?: number;
    latestEntryDate?: string | null;
    ageDays?: number | null;
    currentEnoughForExecutiveUse?: boolean;
    semantics?: string;
  };
  fixedAssets?: {
    total?: number;
    linkedToMotil?: number;
    withAcquisitionCost?: number;
    withAcquisitionDate?: number;
    withUsefulLife?: number;
    economicsReady?: boolean;
  };
  freshness?: {
    latestOperationalSync?: string | null;
    operationalSyncAgeDays?: number | null;
    expectedCadence?: string;
  };
};

const fetcher = async (url: string): Promise<FinanceControl> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Laudus.');
  return payload as FinanceControl;
};

function number(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('es-CL').format(numeric) : '—';
}

function money(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Math.abs(numeric));
}

function compactMoney(value: unknown) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('es-CL', {
    notation: 'compact',
    compactDisplay: 'short',
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 1,
  }).format(Math.abs(numeric));
}

function shortSupplier(value: string) {
  return value.length > 24 ? `${value.slice(0, 22)}…` : value;
}

function shortDate(value?: string | null) {
  if (!value) return 'Sin fecha';
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T12:00:00-03:00`)
    : new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha por revisar';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    timeZone: 'America/Santiago',
  }).format(date);
}

function freshnessText(value?: string | null) {
  if (!value) return 'Sin sincronización';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha por revisar';
  return `Laudus · actualizado ${new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(date)}`;
}

export function LaudusFinanceControlCard() {
  const cockpitOpenedAt = useRef(Date.now());
  const [decisionNotice, setDecisionNotice] = useState<string | null>(null);
  const [decisionByPriority, setDecisionByPriority] = useState<Record<string, string>>({});
  const baselineStartedAt = useRef<number | null>(null);
  const [baselineRunning, setBaselineRunning] = useState(false);
  const [baselineNotice, setBaselineNotice] = useState<string | null>(null);
  const { data, error, isLoading } = useSWR<FinanceControl>(
    '/api/integrations/laudus/finance-control',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );
  const decisionEvidence = useSWR<PriorityDecisionSummary>(
    '/api/value/finance-priority-decision',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la evidencia de decisiones.');
      return payload;
    },
    { revalidateOnFocus: false },
  );
  const baselineEvidence = useSWR<FinanceBaselineSummary>(
    '/api/value/finance-baseline',
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el baseline financiero.');
      return payload;
    },
    { revalidateOnFocus: false },
  );

  if (error) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-5">
          <LaudusSourceMark state="offline" className="mb-3" />
          <p className="text-sm font-medium">Control Laudus no disponible</p>
          <p className="mt-1 text-xs text-muted-foreground">{error.message}</p>
        </CardContent>
      </Card>
    );
  }

  const pendingDeposit = Number(data?.payments?.pendingDeposit || 0);
  const openPayables = Number(data?.accountsPayable?.openItems || 0);
  const overduePayables = Number(data?.accountsPayable?.overdueItems || 0);
  const dueSoonPayables = Number(data?.accountsPayable?.dueWithin7Days || 0);
  const openPayableAmount = Number(data?.accountsPayable?.openAmountClp || 0);
  const overduePayableAmount = Number(data?.accountsPayable?.overdueAmountClp || 0);
  const dueSoonPayableAmount = Number(data?.accountsPayable?.dueSoonAmountClp || 0);
  const agingData = data?.accountsPayable?.aging || [];
  const dueByMonth = data?.accountsPayable?.dueByMonth || [];
  const topSuppliers = data?.accountsPayable?.topSuppliers || [];
  const costCenterUnresolved = Number(data?.costCenters?.unresolved || 0);
  const costCenterMatched = Number(data?.costCenters?.matched || 0);
  const costCenterIgnored = Number(data?.costCenters?.ignored || 0);
  const operationalSyncAgeDays = data?.freshness?.operationalSyncAgeDays;
  const freshnessIsStale = operationalSyncAgeDays !== null && operationalSyncAgeDays !== undefined && operationalSyncAgeDays > 0;
  const accountingCurrent = Boolean(data?.accounting?.currentEnoughForExecutiveUse);
  const fixedAssetLinked = Number(data?.fixedAssets?.linkedToMotil || 0);
  const fixedAssetTotal = Number(data?.fixedAssets?.total || 0);

  const overdueSharePct = openPayableAmount > 0
    ? Math.round((overduePayableAmount / openPayableAmount) * 1000) / 10
    : 0;
  const topSupplier = topSuppliers[0];
  const topSupplierSharePct = Number(data?.accountsPayable?.topSupplierSharePct || 0);
  const fixedAssetCoveragePct = fixedAssetTotal > 0 ? Math.round((fixedAssetLinked / fixedAssetTotal) * 1000) / 10 : null;
  const coveredDomains = [
    data?.accountsPayable?.latestSync ? 'CxP' : null,
    data?.payments?.latestSync ? 'Pagos' : null,
    data?.costCenters?.total && costCenterUnresolved === 0 ? 'Centros' : null,
    fixedAssetCoveragePct != null && fixedAssetCoveragePct >= 80 ? 'Activos' : null,
  ].filter(Boolean);
  const coverageLevel = coveredDomains.length >= 4 && fixedAssetCoveragePct != null && fixedAssetCoveragePct >= 95
    ? 'C5'
    : coveredDomains.length >= 4
      ? 'C4'
      : coveredDomains.length >= 3
        ? 'C3'
        : coveredDomains.length >= 2
          ? 'C2'
          : 'C1';
  const persistedDecisionCount = Number(decisionEvidence.data?.total || 0);
  const timedDecisionCount = Number(decisionEvidence.data?.timedDecisions || 0);
  const baselineSampleCount = Number(baselineEvidence.data?.sampleCount || 0);
  const evidenceLevel = baselineSampleCount >= 3 && timedDecisionCount >= 20 ? 'E3' : persistedDecisionCount > 0 ? 'E2' : 'E1';
  const workflowLevel = persistedDecisionCount > 0 ? 'L4' : 'L3';

  const recordPriorityDecision = async (priorityKey: string, decision: 'accepted' | 'deferred' | 'rejected') => {
    let reason = '';
    if (decision === 'rejected') {
      reason = window.prompt('¿Por qué esta prioridad no aplica?', '')?.trim() || '';
      if (!reason) return;
    }
    setDecisionNotice(null);
    try {
      const response = await fetch('/api/value/finance-priority-decision', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priorityKey,
          decision,
          reason,
          decisionLatencyMs: Math.max(0, Date.now() - cockpitOpenedAt.current),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la decisión.');
      setDecisionByPriority((current) => ({ ...current, [priorityKey]: decision }));
      await decisionEvidence.mutate();
      setDecisionNotice('Decisión registrada. No se modificó Laudus ni el dato canónico.');
    } catch (decisionError) {
      setDecisionNotice(decisionError instanceof Error ? decisionError.message : 'No fue posible registrar la decisión.');
    }
  };

  const saveBaseline = async () => {
    if (!baselineStartedAt.current) return;
    const durationMs = Date.now() - baselineStartedAt.current;
    const rawCases = window.prompt('¿Cuántos casos comparables revisaste manualmente?', '5');
    if (!rawCases) return;
    const caseCount = Number(rawCases);
    setBaselineNotice(null);
    try {
      const response = await fetch('/api/value/finance-baseline', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ durationMs, caseCount }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible guardar el baseline.');
      baselineStartedAt.current = null;
      setBaselineRunning(false);
      await baselineEvidence.mutate();
      setBaselineNotice(`Baseline guardado: ${number(payload.secondsPerCase)} s por caso.`);
    } catch (baselineError) {
      setBaselineNotice(baselineError instanceof Error ? baselineError.message : 'No fue posible guardar el baseline.');
    }
  };

  const priorities = [
    freshnessIsStale
      ? {
          key: 'freshness',
          rank: 130,
          title: 'Revisar actualización de Laudus',
          evidence: `Última sincronización operativa: ${shortDate(data?.freshness?.latestOperationalSync)} · ${number(operationalSyncAgeDays)} día(s) de antigüedad`,
          action: 'Revisar fuente',
          href: '/dashboard/finanzas/fuentes',
        }
      : null,
    overduePayableAmount > 0
      ? {
          key: 'overdue',
          rank: 100 + overdueSharePct,
          title: 'Revisar CxP vencida',
          evidence: `${number(overduePayables)} partidas · ${compactMoney(overduePayableAmount)} · ${number(overdueSharePct)}% del saldo abierto`,
          action: 'Revisar vencidas',
          href: '/dashboard/finanzas/pagos',
        }
      : null,
    dueSoonPayableAmount > 0
      ? {
          key: 'due-soon',
          rank: 80,
          title: 'Preparar vencimientos de 7 días',
          evidence: `${number(dueSoonPayables)} partidas · ${compactMoney(dueSoonPayableAmount)} por vencer`,
          action: 'Ver próximos pagos',
          href: '/dashboard/finanzas/pagos',
        }
      : null,
    topSupplierSharePct >= 15 && topSupplier
      ? {
          key: 'supplier-concentration',
          rank: 75 + topSupplierSharePct,
          title: 'Revisar concentración por proveedor',
          evidence: `${shortSupplier(topSupplier.supplierName)} concentra ${number(topSupplierSharePct)}% · ${compactMoney(topSupplier.amountClp)} del saldo abierto`,
          action: 'Ver proveedor',
          href: '/dashboard/finanzas/pagos',
        }
      : null,
    pendingDeposit > 0
      ? {
          key: 'deposit',
          rank: 70,
          title: 'Validar pagos no depositados',
          evidence: `${number(pendingDeposit)} registros Laudus requieren verificación antes de cerrar conciliación`,
          action: 'Validar pagos',
          href: '/dashboard/finanzas/pagos',
        }
      : null,
    costCenterUnresolved > 0
      ? {
          key: 'cost-centers',
          rank: 60,
          title: 'Cerrar atribución por centro de costo',
          evidence: `${number(costCenterUnresolved)} centros aún no tienen cruce exacto con MOTIL`,
          action: 'Conciliar centros',
          href: '/dashboard/finanzas/centros',
        }
      : null,
    !accountingCurrent
      ? {
          key: 'accounting',
          rank: 40,
          title: 'Mantener contabilidad histórica fuera de decisiones actuales',
          evidence: `Último asiento: ${shortDate(data?.accounting?.latestEntryDate)} · usar sólo como contexto histórico`,
          action: 'Ver trazabilidad',
          href: '/dashboard/finanzas/trazabilidad',
        }
      : null,
  ]
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .sort((left, right) => right.rank - left.rank)
    .slice(0, 3);

  return (
    <Card className="overflow-hidden border-border/80 bg-card shadow-none">
      <CardContent className="space-y-5 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex flex-wrap items-center gap-2">
            <LaudusSourceMark state={isLoading ? 'syncing' : freshnessIsStale ? 'review' : 'connected'} />
            <p className="text-xs font-medium text-muted-foreground">Laudus · fuente financiera</p>
          </div>
          <div className="flex items-center gap-2">
            {!isLoading && freshnessIsStale ? <Badge variant="destructive">Dato atrasado</Badge> : null}
            <p className="text-xs text-muted-foreground">
              {isLoading ? 'Actualizando…' : freshnessText(data?.freshness?.latestOperationalSync)}
            </p>
          </div>
        </div>
        <section className="grid gap-px overflow-hidden rounded-lg border bg-border lg:grid-cols-[1.4fr_1fr]" aria-label="Resumen financiero ejecutivo">
          <div className="bg-card p-5 md:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Exposición abierta</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight">{isLoading ? '—' : compactMoney(openPayableAmount)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {number(openPayables)} partidas abiertas en Laudus. {number(overdueSharePct)}% del saldo está vencido.
            </p>
            <div className="mt-5 flex flex-wrap gap-x-5 gap-y-2 text-xs">
              <span><strong className="font-semibold text-destructive">{compactMoney(overduePayableAmount)}</strong> <span className="text-muted-foreground">vencido</span></span>
              <span><strong className="font-semibold text-foreground">{compactMoney(dueSoonPayableAmount)}</strong> <span className="text-muted-foreground">vence en 7 días</span></span>
            </div>
          </div>
          <div className="grid bg-border sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-destructive">Vencidas</p>
              <p className="mt-1 text-xl font-semibold">{number(overduePayables)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{number(overdueSharePct)}% del saldo abierto</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Próximos 7 días</p>
              <p className="mt-1 text-xl font-semibold">{number(dueSoonPayables)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{compactMoney(dueSoonPayableAmount)} por vencer</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Mayor concentración</p>
              <p className="mt-1 truncate text-sm font-semibold">{topSupplier ? shortSupplier(topSupplier.supplierName) : 'Sin concentración relevante'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{topSupplier ? `${number(topSupplierSharePct)}% · ${compactMoney(topSupplier.amountClp)}` : 'Sin evidencia suficiente'}</p>
            </div>
          </div>
        </section>

        {priorities.length > 0 ? (
          <section className="space-y-3" aria-label="Prioridades financieras de hoy">
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Prioridades</p>
                <p className="mt-1 text-sm font-medium">Qué debe resolver Daniel primero</p>
              </div>
              <span className="text-xs text-muted-foreground">{priorities.length} por resolver</span>
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {priorities.map((item, index) => (
                <div key={item.key} className="grid gap-3 bg-card px-4 py-3.5 md:grid-cols-[36px_minmax(0,1fr)_auto] md:items-center">
                  <div className={`flex h-8 w-8 items-center justify-center rounded-md text-xs font-semibold tabular-nums ${index === 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
                  </div>
                  <div className="flex flex-wrap items-center justify-end gap-1.5">
                    {decisionByPriority[item.key] ? (
                      <Badge variant="outline">Registrada</Badge>
                    ) : (
                      <>
                        <Button type="button" size="sm" variant={index === 0 ? 'default' : 'outline'} onClick={() => void recordPriorityDecision(item.key, 'accepted')}>
                          Tomar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void recordPriorityDecision(item.key, 'deferred')}>
                          Postergar
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => void recordPriorityDecision(item.key, 'rejected')}>
                          No aplica
                        </Button>
                      </>
                    )}
                    <Button asChild size="sm" variant="ghost">
                      <Link href={item.href}>{item.action}<ArrowRight className="ml-2 h-4 w-4"/></Link>
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
            <BadgeCheck className="h-4 w-4"/>
            Sin decisiones financieras urgentes detectadas en la evidencia Laudus disponible.
          </div>
        )}

        {decisionNotice ? <p className="text-xs text-muted-foreground">{decisionNotice}</p> : null}

        <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3" aria-label="LEC Finanzas">
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Level</p>
            <p className="mt-1 text-lg font-semibold">{workflowLevel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {workflowLevel === 'L4' ? `${number(persistedDecisionCount)} decisiones humanas registradas.` : 'MOTIL prioriza; falta registrar una decisión humana.'}
            </p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Evidence</p>
            <p className="mt-1 text-lg font-semibold">{evidenceLevel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {evidenceLevel === 'E3'
                ? `Baseline comparable + ${number(timedDecisionCount)} decisiones cronometradas.`
                : evidenceLevel === 'E2'
                  ? `Decisión humana registrada; ${number(baselineSampleCount)}/3 baselines y ${number(timedDecisionCount)}/20 tiempos para E3.`
                  : 'Fuentes y prioridades registradas; aún sin decisión humana.'}
            </p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Coverage</p>
            <p className="mt-1 text-lg font-semibold">{coverageLevel}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {coveredDomains.length}/4 dominios materiales cubiertos. Activos: {fixedAssetCoveragePct == null ? 'N/D' : `${number(fixedAssetCoveragePct)}%`} enlazados.
            </p>
          </div>
        </section>

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Medición LEC de Daniel</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                Baseline manual: {number(baselineSampleCount)}/3 · decisiones cronometradas: {number(timedDecisionCount)}/20
              </p>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Medir</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
          </summary>
          <div className="border-t p-4">
            <p className="text-xs text-muted-foreground">
              Cronometra una revisión manual comparable sin asistencia de MOTIL. No incluye espera, ejecución posterior ni trabajo contable no relacionado.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              {!baselineRunning ? (
                <Button type="button" size="sm" variant="outline" onClick={() => {
                  baselineStartedAt.current = Date.now();
                  setBaselineRunning(true);
                  setBaselineNotice('Medición activa. Realiza casos comparables por el método manual y vuelve al terminar.');
                }}>
                  Iniciar baseline manual
                </Button>
              ) : (
                <Button type="button" size="sm" onClick={() => void saveBaseline()}>
                  Finalizar medición
                </Button>
              )}
              <span className="text-xs text-muted-foreground">
                Mediana actual: {baselineEvidence.data?.medianSecondsPerCase == null ? '—' : `${number(baselineEvidence.data.medianSecondsPerCase)} s/caso`}
              </span>
            </div>
            {baselineNotice ? <p className="mt-2 text-xs text-muted-foreground">{baselineNotice}</p> : null}
            <p className="mt-3 text-[11px] text-muted-foreground">
              E3 sólo se habilita con ≥3 muestras manuales y ≥20 decisiones asistidas cronometradas. No se monetiza hasta E4.
            </p>
          </div>
        </details>

        <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Cobertura financiera">
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pagos por revisar</p>
            <p className="mt-1 text-lg font-semibold">{number(pendingDeposit)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Centros por conciliar</p>
            <p className="mt-1 text-lg font-semibold">{number(costCenterUnresolved)}</p>
            <p className="mt-1 text-[11px] text-muted-foreground">{number(costCenterMatched)} conciliados · {number(costCenterIgnored)} cerrados/ignorados</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Activos enlazados</p>
            <p className="mt-1 text-lg font-semibold">{number(fixedAssetLinked)} <span className="text-xs font-normal text-muted-foreground">/ {number(fixedAssetTotal)}</span></p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Notas de crédito</p>
            <p className="mt-1 text-lg font-semibold">{money(data?.creditNotes?.documentedAmount)}</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Documentadas · no es ahorro</p>
          </div>
        </section>

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
            <div>
              <p className="text-sm font-medium">Contexto operativo</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Cambios de 7 días, colas de trabajo y análisis adicional</p>
            </div>
            <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
            <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
          </summary>
          <section className="space-y-4 border-t p-4" aria-label="Lectura ejecutiva Laudus">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-lg border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cambios observables · 7 días</p>
              <div className="mt-3 grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2">
                <div className="bg-card px-4 py-3">
                  <p className="text-2xl font-semibold">{number(data?.accountsPayable?.newOpenIssued7d || 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">partidas abiertas emitidas</p>
                </div>
                <div className="bg-card px-4 py-3">
                  <p className="text-2xl font-semibold">{number(data?.accountsPayable?.becameOverdue7d || 0)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">entraron en mora</p>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Cambio observable por fechas de emisión y vencimiento. Aún no existe una serie diaria histórica comparable de saldo.
              </p>
            </div>

            <div className="rounded-lg border bg-card p-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Listo para trabajar hoy</p>
              <div className="mt-3 divide-y rounded-lg border">
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">Pagos por verificar</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{number(pendingDeposit)} registros con estado Laudus por revisar</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/finanzas/pagos">Revisar</Link>
                  </Button>
                </div>
                <div className="flex items-center justify-between gap-3 px-3 py-3">
                  <div>
                    <p className="text-sm font-medium">Centros por conciliar</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      {costCenterUnresolved > 0
                        ? `${number(costCenterUnresolved)} centros todavía requieren revisión`
                        : `Sin pendientes · ${number(costCenterMatched)} conciliados y ${number(costCenterIgnored)} cerrados/ignorados`}
                    </p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/finanzas/centros">{costCenterUnresolved > 0 ? 'Conciliar' : 'Ver centros'}</Link>
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Son colas accionables, no cierres automáticos. Daniel conserva la decisión y la evidencia queda trazable.
              </p>
            </div>
          </div>

          <details className="group rounded-lg border bg-card">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
              <div>
                <p className="text-sm font-medium">Análisis adicional</p>
                <p className="mt-0.5 text-xs text-muted-foreground">Aging, vencimientos y concentración por proveedor</p>
              </div>
              <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
              <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
            </summary>
            <div className="space-y-4 border-t p-4">
              <div className="grid gap-4 xl:grid-cols-2">
                          <div className="rounded-lg border bg-card p-4">
                            <div className="mb-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Riesgo</p>
                              <h3 className="mt-1 text-base font-semibold">Aging de CxP abierta</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Distribución actual por antigüedad de vencimiento. Laudus · {shortDate(data?.accountsPayable?.latestSync)}</p>
                            </div>
                            <div className="h-64 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={agingData} layout="vertical" margin={{ left: 4, right: 16 }}>
                                  <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                                  <XAxis type="number" tickFormatter={(value) => compactMoney(value)} tick={{ fontSize: 11 }} />
                                  <YAxis type="category" dataKey="label" width={78} tick={{ fontSize: 11 }} />
                                  <Tooltip formatter={(value) => [money(value), 'Saldo abierto']} />
                                  <Bar dataKey="amountClp" fill="currentColor" className="text-foreground" radius={[0, 4, 4, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
              
                          <div className="rounded-lg border bg-card p-4">
                            <div className="mb-4">
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Estructura temporal</p>
                              <h3 className="mt-1 text-base font-semibold">Vencimientos abiertos por mes</h3>
                              <p className="mt-1 text-xs text-muted-foreground">No es una serie histórica de saldo: muestra cuándo venció o vence la cartera que sigue abierta hoy.</p>
                            </div>
                            <div className="h-64 w-full">
                              <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={dueByMonth} margin={{ left: 4, right: 16 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.25} />
                                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                                  <YAxis tickFormatter={(value) => compactMoney(value)} tick={{ fontSize: 11 }} width={64} />
                                  <Tooltip formatter={(value) => [money(value), 'Saldo abierto']} />
                                  <Bar dataKey="amountClp" fill="currentColor" className="text-muted-foreground" radius={[4, 4, 0, 0]} />
                                </BarChart>
                              </ResponsiveContainer>
                            </div>
                          </div>
                        </div>
              
                        <div className="rounded-lg border bg-card p-4">
                          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lectura MOTIL</p>
                          <p className="mt-2 text-sm font-medium">
                            {number(data?.accountsPayable?.severeAgingSharePct || 0)}% del saldo abierto CLP está en partidas con más de 60 días de atraso.
                            {' '}El proveedor con mayor saldo abierto concentra {number(data?.accountsPayable?.topSupplierSharePct || 0)}%.
                          </p>
                          <p className="mt-1 text-xs text-muted-foreground">
                            Son concentraciones observadas en Laudus. No implican causalidad, prioridad de pago ni riesgo financiero definitivo sin conciliación.
                          </p>
                        </div>
              
                        <div className="rounded-lg border bg-card p-4">
                          <div className="mb-4 flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                            <div>
                              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Explicación</p>
                              <h3 className="mt-1 text-base font-semibold">Concentración por proveedor</h3>
                              <p className="mt-1 text-xs text-muted-foreground">Saldo abierto actual. Concentración no implica causalidad ni prioridad de pago automática.</p>
                            </div>
                            <Badge variant="outline">Top {topSuppliers.length}</Badge>
                          </div>
                          <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                              <BarChart
                                data={topSuppliers.map((item) => ({ ...item, supplierLabel: `${shortSupplier(item.supplierName)} · ${item.sharePct}%` }))}
                                layout="vertical"
                                margin={{ left: 8, right: 24 }}
                              >
                                <CartesianGrid strokeDasharray="3 3" horizontal={false} opacity={0.25} />
                                <XAxis type="number" tickFormatter={(value) => compactMoney(value)} tick={{ fontSize: 11 }} />
                                <YAxis type="category" dataKey="supplierLabel" width={180} tick={{ fontSize: 11 }} />
                                <Tooltip formatter={(value) => [money(value), 'Saldo abierto']} />
                                <Bar dataKey="amountClp" fill="currentColor" className="text-foreground" radius={[0, 4, 4, 0]} />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                          <p className="mt-2 text-[11px] text-muted-foreground">
                            {data?.accountsPayable?.historicalTrendAvailable
                              ? 'Tendencia histórica disponible.'
                              : 'La tendencia histórica de saldo aún no existe como serie canónica. MOTIL no la simula; empezará a mostrarse cuando existan snapshots comparables.'}
                          </p>
                        </div>
                      
            </div>
          </details>
          </section>
        </details>

        <section className="space-y-3" aria-label="Evidencia y brechas">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Evidencia y brechas</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Detalle secundario para validar una decisión. Cerrado por defecto.
            </p>
          </div>

          <div className="divide-y overflow-hidden rounded-lg border bg-card">
            {openPayables > 0 ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">CxP más antiguas</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{number(overduePayables)} vencidas · {number(dueSoonPayables)} vencen en 7 días</p>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
                  <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
                </summary>
                <div className="border-t px-4 py-3">
                  <div className="divide-y rounded-md border">
                    {(data?.accountsPayable?.oldestOpenItems || []).map((item) => (
                      <div key={item.externalId || item.documentNumber || item.dueDate || 'cxp'} className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[minmax(0,1fr)_100px_120px_auto] md:items-center">
                        <span className="truncate font-medium">{item.supplierName || 'Proveedor Laudus'}</span>
                        <span className="text-muted-foreground">{item.documentNumber || 'Sin doc.'}</span>
                        <span className="text-muted-foreground">Vence {shortDate(item.dueDate)}</span>
                        <span className="text-right font-medium">
                          {item.currency === 'CLP' ? money(item.outstandingAmount) : item.outstandingAmount ? number(item.outstandingAmount) : 'Monto no informado'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Ordenado por vencimiento más antiguo. MOTIL no trata estos saldos como caja comprometida definitiva sin conciliación.
                  </p>
                </div>
              </details>
            ) : null}

            {pendingDeposit > 0 ? (
              <details className="group">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                  <div>
                    <p className="text-sm font-medium">Pagos por verificar</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{number(pendingDeposit)} registros con estado “no depositado” en Laudus</p>
                  </div>
                  <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
                  <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
                </summary>
                <div className="border-t px-4 py-3">
                  <div className="divide-y rounded-md border">
                    {(data?.payments?.pendingItems || []).map((item) => (
                      <div key={item.externalId || item.document || item.issuedDate || 'pago'} className="grid gap-2 px-3 py-2 text-xs md:grid-cols-[110px_140px_minmax(0,1fr)_auto] md:items-center">
                        <span className="font-medium">{item.document || 'Sin documento'}</span>
                        <span className="text-muted-foreground">{shortDate(item.issuedDate)}</span>
                        <span className="min-w-0 truncate text-muted-foreground">{item.notes || item.bankName || 'Sin nota'}</span>
                        <span className="text-right font-medium">
                          {item.invoiceAmount && item.currency === 'CLP' ? money(item.invoiceAmount) : 'Monto no informado'}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Estado fuente Laudus. MOTIL no lo interpreta automáticamente como deuda, error bancario ni pago pendiente.
                  </p>
                </div>
              </details>
            ) : null}

            <details className="group">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3">
                <div>
                  <p className="text-sm font-medium">Cobertura de evidencia</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Centros, contabilidad y activos que aún limitan análisis ejecutivo</p>
                </div>
                <span className="text-xs text-muted-foreground group-open:hidden">Ver</span>
                <span className="hidden text-xs text-muted-foreground group-open:inline">Ocultar</span>
              </summary>
              <div className="grid gap-px border-t bg-border md:grid-cols-3">
                <div className="bg-card px-4 py-3">
                  <p className="text-sm font-medium">Centros de costo</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {number(costCenterUnresolved)} sin cruce exacto. No se usarán para atribución ejecutiva hasta resolverlos.
                  </p>
                  <Button asChild size="sm" variant="ghost" className="mt-2 h-8 px-0">
                    <Link href="/dashboard/finanzas/centros">Conciliar <ArrowRight className="ml-2 h-3.5 w-3.5"/></Link>
                  </Button>
                </div>
                <div className="bg-card px-4 py-3">
                  <p className="text-sm font-medium">Contabilidad</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {accountingCurrent ? 'Vigente para análisis ejecutivo.' : `Histórica. Último asiento: ${shortDate(data?.accounting?.latestEntryDate)}.`}
                  </p>
                </div>
                <div className="bg-card px-4 py-3">
                  <p className="text-sm font-medium">Activos</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {number(fixedAssetLinked)} de {number(fixedAssetTotal)} enlazados. Sin evidencia suficiente no se declara valor libro real.
                  </p>
                  <Button asChild size="sm" variant="ghost" className="mt-2 h-8 px-0">
                    <Link href="/dashboard/finanzas/activos-laudus">
                      Revisar activos <ArrowRight className="ml-2 h-3.5 w-3.5" />
                    </Link>
                  </Button>
                </div>
              </div>
            </details>
          </div>
        </section>

        <p className="text-xs text-muted-foreground">
          Solo lectura. Laudus sigue siendo fuente financiera; MOTIL organiza evidencia y decisiones sin escribir pagos, asientos ni documentos en el ERP.
        </p>
      </CardContent>
    </Card>
  );
}
