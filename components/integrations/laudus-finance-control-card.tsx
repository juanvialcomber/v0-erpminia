'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, CircleDollarSign, Landmark, ReceiptText } from 'lucide-react';
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
  const date = new Date(value);
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

  return (
    <Card className="overflow-hidden shadow-none">
      <CardHeader className="border-b pb-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Laudus · control financiero</p>
            <CardTitle className="mt-1 text-xl">Qué requiere decisión</CardTitle>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              MOTIL separa información vigente, conciliaciones pendientes y datos históricos para que Daniel no tome decisiones sobre evidencia incompleta.
            </p>
          </div>
          <Badge variant="outline">{isLoading ? 'Actualizando' : freshnessText(data?.freshness?.latestOperationalSync)}</Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-5 p-5">
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="h-4 w-4"/>Pagos</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.payments?.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(data?.payments?.deposited)} depositados · {number(pendingDeposit)} por revisar</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-4 w-4"/>CxP Laudus</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(openPayables)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(overduePayables)} vencidas · {number(dueSoonPayables)} vencen en 7 días</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><ReceiptText className="h-4 w-4"/>Notas de crédito</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.creditNotes?.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{money(data?.creditNotes?.documentedAmount)} documentados · no es ahorro</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Building2 className="h-4 w-4"/>Centros de costo</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.costCenters?.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(costCenterUnresolved)} pendientes de conciliación</p>
          </div>
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><Landmark className="h-4 w-4"/>Activos Laudus</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(fixedAssetTotal)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(fixedAssetLinked)} enlazados a activos MOTIL</p>
          </div>
        </div>

        <section className="space-y-4" aria-label="Lectura ejecutiva Laudus">
          <div className="grid gap-px overflow-hidden rounded-xl border bg-border md:grid-cols-4">
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Cambio · 7 días</p>
              <p className="mt-2 text-xl font-semibold">{number(data?.accountsPayable?.newOpenIssued7d || 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">partidas abiertas emitidas esta semana</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Entraron en mora</p>
              <p className="mt-2 text-xl font-semibold">{number(data?.accountsPayable?.becameOverdue7d || 0)}</p>
              <p className="mt-1 text-xs text-muted-foreground">vencieron durante los últimos 7 días</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Vencen próximos 7 días</p>
              <p className="mt-2 text-xl font-semibold">{number(dueSoonPayables)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{compactMoney(dueSoonPayableAmount)} en estado fuente Laudus</p>
            </div>
            <div className="bg-card px-4 py-4">
              <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Exposición abierta</p>
              <p className="mt-2 text-xl font-semibold">{compactMoney(openPayableAmount)}</p>
              <p className="mt-1 text-xs text-muted-foreground">{compactMoney(overduePayableAmount)} corresponde a partidas vencidas</p>
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
