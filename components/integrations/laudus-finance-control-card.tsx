'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, ReceiptText } from 'lucide-react';
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

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
    resolvedExact?: number;
    unresolved?: number;
    discontinued?: number;
    latestSync?: string | null;
    reconciliationRequired?: boolean;
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
  const { data, error, isLoading } = useSWR<FinanceControl>(
    '/api/integrations/laudus/finance-control',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );

  if (error) {
    return (
      <Card className="shadow-none">
        <CardContent className="p-5">
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
  const accountingCurrent = Boolean(data?.accounting?.currentEnoughForExecutiveUse);
  const fixedAssetLinked = Number(data?.fixedAssets?.linkedToMotil || 0);
  const fixedAssetTotal = Number(data?.fixedAssets?.total || 0);

  const overdueSharePct = openPayableAmount > 0
    ? Math.round((overduePayableAmount / openPayableAmount) * 1000) / 10
    : 0;
  const topSupplier = topSuppliers[0];
  const topSupplierSharePct = Number(data?.accountsPayable?.topSupplierSharePct || 0);

  const priorities = [
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
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b pb-5">
        <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Finanzas · Laudus</p>
            <CardTitle className="mt-1 text-2xl">Control financiero</CardTitle>
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
              Exposición, vencimientos y decisiones prioritarias con evidencia vigente. Sin convertir datos fuente en conclusiones contables no conciliadas.
            </p>
          </div>
          <Badge variant="outline" className="w-fit">
            {isLoading ? 'Actualizando' : freshnessText(data?.freshness?.latestOperationalSync)}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-6 p-5">
        <section className="grid gap-px overflow-hidden rounded-xl border bg-border lg:grid-cols-[1.35fr_1fr]" aria-label="Resumen financiero ejecutivo">
          <div className="bg-card p-5 md:p-6">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Exposición abierta</p>
            <p className="mt-3 text-4xl font-semibold tracking-tight">{isLoading ? '—' : compactMoney(openPayableAmount)}</p>
            <p className="mt-2 text-sm text-muted-foreground">
              {number(openPayables)} partidas abiertas en Laudus. {number(overdueSharePct)}% del saldo está vencido.
            </p>
            <div className="mt-5 flex flex-wrap gap-2">
              <Badge variant="secondary">{compactMoney(overduePayableAmount)} vencido</Badge>
              <Badge variant="outline">{compactMoney(dueSoonPayableAmount)} vence en 7 días</Badge>
            </div>
          </div>
          <div className="grid bg-border sm:grid-cols-3 lg:grid-cols-1">
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Vencidas</p>
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
              <span className="text-xs text-muted-foreground">Máximo 3 decisiones</span>
            </div>
            <div className="divide-y overflow-hidden rounded-xl border">
              {priorities.map((item, index) => (
                <div key={item.key} className="grid gap-3 bg-card px-4 py-4 md:grid-cols-[44px_minmax(0,1fr)_auto] md:items-center">
                  <div className="flex h-9 w-9 items-center justify-center rounded-md border text-xs font-semibold tabular-nums">
                    {String(index + 1).padStart(2, '0')}
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{item.title}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{item.evidence}</p>
                  </div>
                  <Button asChild size="sm" variant={index === 0 ? 'default' : 'outline'}>
                    <Link href={item.href}>{item.action}<ArrowRight className="ml-2 h-4 w-4"/></Link>
                  </Button>
                </div>
              ))}
            </div>
          </section>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border p-4 text-sm">
            <BadgeCheck className="h-4 w-4"/>
            Sin decisiones financieras urgentes detectadas en la evidencia Laudus disponible.
          </div>
        )}

        <section className="grid gap-px overflow-hidden rounded-xl border bg-border sm:grid-cols-2 xl:grid-cols-4" aria-label="Cobertura financiera">
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pagos por revisar</p>
            <p className="mt-1 text-lg font-semibold">{number(pendingDeposit)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Centros por conciliar</p>
            <p className="mt-1 text-lg font-semibold">{number(costCenterUnresolved)}</p>
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

        <section className="space-y-4" aria-label="Lectura ejecutiva Laudus">
          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
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

            <div className="rounded-xl border bg-card p-4">
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
                    <p className="mt-0.5 text-xs text-muted-foreground">{number(costCenterUnresolved)} centros sin cruce exacto MOTIL</p>
                  </div>
                  <Button asChild size="sm" variant="outline">
                    <Link href="/dashboard/finanzas/centros">Conciliar</Link>
                  </Button>
                </div>
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Son colas accionables, no cierres automáticos. Daniel conserva la decisión y la evidencia queda trazable.
              </p>
            </div>
          </div>

          <div className="grid gap-4 xl:grid-cols-2">
            <div className="rounded-xl border bg-card p-4">
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

            <div className="rounded-xl border bg-card p-4">
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

          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Lectura MOTIL</p>
            <p className="mt-2 text-sm font-medium">
              {number(data?.accountsPayable?.severeAgingSharePct || 0)}% del saldo abierto CLP está en partidas con más de 60 días de atraso.
              {' '}El proveedor con mayor saldo abierto concentra {number(data?.accountsPayable?.topSupplierSharePct || 0)}%.
            </p>
            <p className="mt-1 text-xs text-muted-foreground">
              Son concentraciones observadas en Laudus. No implican causalidad, prioridad de pago ni riesgo financiero definitivo sin conciliación.
            </p>
          </div>

          <div className="rounded-xl border bg-card p-4">
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
        </section>

        <div className="space-y-2">
          {openPayables > 0 ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium"><ReceiptText className="h-4 w-4"/>CxP Laudus que requiere revisión</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {number(overduePayables)} partidas están vencidas y {number(dueSoonPayables)} vencen en los próximos 7 días. Son saldos fuente Laudus y requieren conciliación antes de tratarlos como compromiso de caja definitivo.
                  </p>
                </div>
                <Button asChild size="sm"><Link href="/dashboard/finanzas/pagos">Revisar CxP <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
              </div>
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
              <p className="text-[11px] text-muted-foreground">
                Ordenado por vencimiento más antiguo. MOTIL no suma estos saldos como caja comprometida ni deuda final hasta completar conciliación.
              </p>
            </div>
          ) : null}

          {pendingDeposit > 0 ? (
            <div className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4"/>Pagos por verificar</p>
                  <p className="mt-1 text-xs text-muted-foreground">{number(pendingDeposit)} pagos Laudus no figuran depositados. Revisar antes de cerrar conciliación o caja.</p>
                </div>
                <Button asChild size="sm"><Link href="/dashboard/finanzas/pagos">Revisar pagos <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
              </div>
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
              <p className="text-[11px] text-muted-foreground">Estado fuente Laudus: “no depositado”. MOTIL no lo interpreta automáticamente como deuda, error bancario ni pago pendiente.</p>
            </div>
          ) : null}

          {costCenterUnresolved > 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium"><Building2 className="h-4 w-4"/>Centros de costo por conciliar</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Laudus tiene {number(data?.costCenters?.total)} centros de costo; {number(costCenterUnresolved)} todavía no tienen cruce exacto con MOTIL. No se usarán para atribución ejecutiva hasta resolverlos.
                </p>
              </div>
              <Button asChild size="sm" variant="outline"><Link href="/dashboard/finanzas/centros">Conciliar <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
            </div>
          ) : null}

          {!accountingCurrent ? (
            <div className="flex flex-col gap-3 rounded-lg border border-dashed p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="flex items-center gap-2 text-sm font-medium"><AlertTriangle className="h-4 w-4"/>Contabilidad Laudus histórica</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Hay {number(data?.accounting?.entries)} asientos disponibles, pero el último es del {shortDate(data?.accounting?.latestEntryDate)}. MOTIL no los presenta como saldo contable actual.
                </p>
              </div>
              <Badge variant="secondary">Histórico</Badge>
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-lg border p-4 text-sm">
              <BadgeCheck className="h-4 w-4"/>
              Contabilidad Laudus vigente para análisis ejecutivo.
            </div>
          )}

          {fixedAssetTotal > 0 && fixedAssetLinked === 0 ? (
            <div className="flex flex-col gap-3 rounded-lg border p-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-sm font-medium">Activos fijos disponibles, economía todavía incompleta</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Laudus aporta fecha y vida útil para {number(data?.fixedAssets?.withUsefulLife)} activos, pero aún no hay enlaces canónicos ni costo de adquisición suficiente para declarar valor libro real.
                </p>
              </div>
              <Button asChild size="sm" variant="outline"><Link href="/dashboard/finanzas/trazabilidad">Revisar evidencia <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
            </div>
          ) : null}
        </div>

        <p className="text-xs text-muted-foreground">
          Solo lectura. Laudus sigue siendo fuente financiera; MOTIL organiza evidencia y decisiones sin escribir pagos, asientos ni documentos en el ERP.
        </p>
      </CardContent>
    </Card>
  );
}
