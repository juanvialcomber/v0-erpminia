'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, CircleDollarSign, ReceiptText, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Payload = {
  summary: {
    openMatchExceptions: number;
    payablesWithBalance: number;
    overduePayables: number;
    payablesMissingDueDate: number;
    unreconciledPayments: number;
    approvedInvoices: number;
    ordersAwaitingReceipt: number;
    openBalance: number;
    operationalOrders: number;
    maintenanceLinkedOrders: number;
    unlinkedOperationalOrders: number;
    excludedUatOrders: number;
  };
  maintenanceCost: {
    auditedWorkOrders: number;
    costEvidenceWorkOrders: number;
    zeroCostSnapshots: number;
    costEvidenceCoveragePercent: number | null;
    auditedTotalCost: number | null;
    partsCost: number | null;
    laborCost: number | null;
    externalCost: number | null;
    lastAuditedCloseAt: string | null;
    semantics: string;
  };
  nextAction: {
    key: string;
    title: string;
    description: string;
    href: string;
    action: string;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el control financiero.');
  return payload;
};

const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));

export function MotilFinanceOperatingCockpit() {
  const { data, error, isLoading } = useSWR('/api/finance/operating-control', fetcher, { revalidateOnFocus: false });

  return <section className="space-y-3" aria-label="Control operativo financiero MOTIL">
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">MOTIL operativo</p>
        <h2 className="mt-1 text-lg font-semibold">Qué requiere decisión</h2>
      </div>
      <p className="hidden text-xs text-muted-foreground sm:block">Laudus queda como fuente financiera/tributaria de contraste</p>
    </div>

    <Card className="shadow-none">
      <CardContent className="flex flex-col gap-4 p-5 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            {data?.nextAction.key === 'clear' ? <CheckCircle2 className="h-4 w-4 text-muted-foreground"/> : <ShieldCheck className="h-4 w-4 text-muted-foreground"/>}
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p>
          </div>
          <p className="mt-2 text-lg font-semibold">{isLoading ? 'Calculando…' : error ? 'Control no disponible' : data?.nextAction.title}</p>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{error ? error.message : data?.nextAction.description}</p>
        </div>
        {!isLoading && !error && data ? <Button asChild><Link href={data.nextAction.href}>{data.nextAction.action}<ArrowRight className="h-4 w-4"/></Link></Button> : null}
      </CardContent>
    </Card>

    <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
      {[
        ['Excepciones', data?.summary.openMatchExceptions ?? '—', 'Three-way match'],
        ['CxP abiertas', data?.summary.payablesWithBalance ?? '—', data ? money(data.summary.openBalance) : 'Saldo'],
        ['Vencidas', data?.summary.overduePayables ?? '—', 'Atención'],
        ['Por conciliar', data?.summary.unreconciledPayments ?? '—', 'Pagos'],
        ['Por recibir', data?.summary.ordersAwaitingReceipt ?? '—', 'Órdenes'],
      ].map(([label,value,detail]) => <div key={String(label)} className="bg-card p-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-semibold tabular-nums">{isLoading || error ? '—' : value}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">{detail}</p>
      </div>)}
    </div>

    {!isLoading && !error && data ? <Card className="shadow-none">
      <CardContent className="grid gap-4 p-5 lg:grid-cols-[1fr_auto] lg:items-center">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Puente económico · mantenimiento</p>
          <p className="mt-1 text-sm font-medium">
            {data.maintenanceCost.costEvidenceWorkOrders > 0
              ? `${data.maintenanceCost.costEvidenceWorkOrders}/${data.maintenanceCost.auditedWorkOrders} OT con evidencia monetaria`
              : `${data.maintenanceCost.auditedWorkOrders} OT auditadas · costo monetario aún no capturado`}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Compras operativas reales: {data.summary.operationalOrders}. Vinculadas explícitamente a OT/activo: {data.summary.maintenanceLinkedOrders}. Sin vínculo: {data.summary.unlinkedOperationalOrders}.
            {data.summary.excludedUatOrders > 0 ? ` Se excluyeron ${data.summary.excludedUatOrders} casos UAT del control.` : ''}
          </p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            {data.maintenanceCost.costEvidenceWorkOrders > 0
              ? `Costo observado: ${money(data.maintenanceCost.auditedTotalCost || 0)}. No incluye costos sin evidencia.`
              : 'MOTIL no interpreta snapshots en $0 como costo real cero.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/mantenimiento/costos">Costos OT</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href="/dashboard/finanzas/activos">Economía activos</Link></Button>
        </div>
      </CardContent>
    </Card> : null}

    <div className="grid gap-3 md:grid-cols-3">
      <Link href="/dashboard/compras/flujo" className="rounded-lg border p-4 transition-colors hover:bg-muted/30"><ReceiptText className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Compra</p><p className="mt-1 text-xs text-muted-foreground">Necesidad → OC → recepción → factura.</p></Link>
      <Link href="/dashboard/finanzas/pagos" className="rounded-lg border p-4 transition-colors hover:bg-muted/30"><CircleDollarSign className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Tesorería</p><p className="mt-1 text-xs text-muted-foreground">Aprobación → vencimiento → pago → conciliación.</p></Link>
      <Link href="/dashboard/finanzas/trazabilidad" className="rounded-lg border p-4 transition-colors hover:bg-muted/30"><ShieldCheck className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-sm font-medium">Evidencia</p><p className="mt-1 text-xs text-muted-foreground">Fuente, DTE, Laudus y trazabilidad sin rehacer el trabajo.</p></Link>
    </div>
  </section>;
}
