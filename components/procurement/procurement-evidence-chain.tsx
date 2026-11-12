'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Link2Off } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';

type EvidenceChain = {
  readOnly?: boolean;
  operational?: {
    orders?: number;
    receipts?: number;
    invoices?: number;
    invoiceStatus?: { approved?: number; rejected?: number };
    threeWay?: { matched?: number; exception?: number; rejected?: number; pendingReceipt?: number };
  };
  historical?: {
    purchaseOrdersReferenceOnly?: number;
    receivedOperationally?: number;
    pendingOperationalReceipt?: number;
    semantics?: string;
  };
  laudus?: {
    invoices?: number;
    paid?: number;
    partiallyPaid?: number;
    unpaid?: number;
    linkage?: string;
    semantics?: string;
  };
  policy?: {
    historicalReceiptPromoted?: boolean;
    automaticPaymentApproval?: boolean;
    automaticCanonicalMutation?: boolean;
    humanReviewRequired?: boolean;
  };
};

const fetcher = async (url: string): Promise<EvidenceChain> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la cadena de evidencia');
  return payload as EvidenceChain;
};

function number(value: unknown) {
  const n = Number(value);
  return Number.isFinite(n) ? new Intl.NumberFormat('es-CL').format(n) : '—';
}

export function ProcurementEvidenceChain() {
  const { data, error, isLoading } = useSWR<EvidenceChain>('/api/procurement/evidence-chain', fetcher);

  const operationalOrders = Number(data?.operational?.orders || 0);
  const receipts = Number(data?.operational?.receipts || 0);
  const invoices = Number(data?.operational?.invoices || 0);
  const matched = Number(data?.operational?.threeWay?.matched || 0);
  const exceptions = Number(data?.operational?.threeWay?.exception || 0);
  const rejected = Number(data?.operational?.threeWay?.rejected || 0);
  const pendingReceipt = Number(data?.operational?.threeWay?.pendingReceipt || 0);
  const historical = Number(data?.historical?.purchaseOrdersReferenceOnly || 0);
  const laudusInvoices = Number(data?.laudus?.invoices || 0);
  const laudusPaid = Number(data?.laudus?.paid || 0);
  const laudusPartial = Number(data?.laudus?.partiallyPaid || 0);
  const laudusUnpaid = Number(data?.laudus?.unpaid || 0);

  return (
    <Card>
      <CardContent className="space-y-5 p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Cadena de evidencia</p>
            <h2 className="mt-1 text-lg font-semibold">OC → recepción → factura → pago</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              MOTIL separa hechos operacionales de evidencia histórica y estado financiero Laudus. Nada se promueve automáticamente.
            </p>
          </div>
          <span className="rounded-full border px-2.5 py-1 text-xs text-muted-foreground">Solo lectura</span>
        </div>

        {error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
            No se pudo cargar la cadena. {error.message}
          </div>
        ) : null}

        <div className="grid gap-3 lg:grid-cols-4">
          <section className="rounded-lg border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">01 · OC operacional</p>
            <p className="mt-2 text-3xl font-semibold">{isLoading ? '—' : number(operationalOrders)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Órdenes nacidas en el flujo operativo MOTIL.</p>
          </section>

          <section className="rounded-lg border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">02 · Recepción real</p>
            <p className="mt-2 text-3xl font-semibold">{isLoading ? '—' : number(receipts)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Recepciones registradas con evidencia operacional.</p>
          </section>

          <section className="rounded-lg border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">03 · Factura MOTIL</p>
            <p className="mt-2 text-3xl font-semibold">{isLoading ? '—' : number(invoices)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Facturas del flujo operativo sujetas a three-way match.</p>
          </section>

          <section className="rounded-lg border p-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">04 · Match</p>
            <p className="mt-2 text-3xl font-semibold">{isLoading ? '—' : number(matched)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Coincidencias determinísticas OC–recepción–factura.</p>
          </section>
        </div>

        <div className="grid gap-3 xl:grid-cols-2">
          <section className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-4 w-4 text-amber-600" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Historia útil, no recepción física</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {number(historical)} OCs antiguas quedan como <strong>evidencia histórica</strong>. Pueden dar contexto de proveedor, monto y compra, pero no prueban que el material haya sido recibido.
                </p>
              </div>
            </div>
          </section>

          <section className="rounded-lg border bg-muted/20 p-4">
            <div className="flex items-start gap-3">
              <Link2Off className="mt-0.5 h-4 w-4 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium">Laudus permanece como evidencia financiera</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {number(laudusInvoices)} facturas fuente: {number(laudusPaid)} pagadas, {number(laudusPartial)} parciales y {number(laudusUnpaid)} no pagadas. Se muestran como universo financiero, no como enlace automático a una OC MOTIL.
                </p>
              </div>
            </div>
          </section>
        </div>

        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-4">
          <div className="bg-card p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Match correcto</p>
            <p className="mt-1 text-lg font-semibold">{number(matched)}</p>
          </div>
          <div className="bg-card p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Excepción</p>
            <p className="mt-1 text-lg font-semibold">{number(exceptions)}</p>
          </div>
          <div className="bg-card p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Rechazada</p>
            <p className="mt-1 text-lg font-semibold">{number(rejected)}</p>
          </div>
          <div className="bg-card p-3">
            <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground">Pendiente recepción</p>
            <p className="mt-1 text-lg font-semibold">{number(pendingReceipt)}</p>
          </div>
        </div>

        <div className="flex items-start gap-2 text-xs text-muted-foreground">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            Regla activa: una factura no se interpreta como pago, una OC histórica no se interpreta como recepción y un estado Laudus no aprueba automáticamente una obligación en MOTIL.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
