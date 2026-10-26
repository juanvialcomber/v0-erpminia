'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, BadgeCheck, Building2, CircleDollarSign, Landmark, ReceiptText } from 'lucide-react';
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
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
          <div className="rounded-lg border p-4">
            <p className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="h-4 w-4"/>Pagos</p>
            <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.payments?.total)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{number(data?.payments?.deposited)} depositados · {number(pendingDeposit)} por revisar</p>
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

        <div className="space-y-2">
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
