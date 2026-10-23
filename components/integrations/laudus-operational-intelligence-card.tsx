'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, GitMerge, ReceiptText, Truck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type ExceptionRow = {
  document_type: 'invoice' | 'waybill';
  external_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  issued_date: string | null;
  status: 'ambiguous' | 'price_review' | 'unmatched' | 'exact_candidate';
  unmatched_lines: number;
  ambiguous_lines: number;
  price_review_lines: number;
};

type Payload = {
  scope_days: number;
  documents: {
    orders: number;
    waybill_headers: number;
    invoice_headers: number;
  };
  invoices: {
    with_lines: number;
    exact_candidate: number;
    ambiguous: number;
    price_review: number;
    unmatched: number;
  };
  waybills: {
    with_lines: number;
    exact_candidate: number;
    ambiguous: number;
    unmatched: number;
  };
  exceptions: ExceptionRow[];
  policy: 'candidate_only';
  threeWay?: {
    invoice_lines: {
      total_invoice_lines: number;
      exact_invoice_lines: number;
      probable_invoice_lines: number;
      ambiguous_invoice_lines: number;
      review_invoice_lines: number;
      unmatched_invoice_lines: number;
      three_way_lines: number;
    };
    waybill_lines: {
      total_waybill_lines: number;
      exact_waybill_lines: number;
      probable_waybill_lines: number;
      ambiguous_waybill_lines: number;
      review_waybill_lines: number;
      unmatched_waybill_lines: number;
    };
    score_model: string;
    policy: 'candidate_only';
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible calcular inteligencia operacional.');
  return payload;
};

const n = (value: number | undefined) =>
  typeof value === 'number' ? new Intl.NumberFormat('es-CL').format(value) : '—';

const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value))
    : '—';

const statusLabel: Record<ExceptionRow['status'], string> = {
  ambiguous: 'Ambiguo',
  price_review: 'Revisar precio',
  unmatched: 'Sin OC candidata',
  exact_candidate: 'Candidato exacto',
};

export function LaudusOperationalIntelligenceCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/operational-intelligence?days=120',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  const openInvoices = (data?.invoices.ambiguous || 0) + (data?.invoices.price_review || 0) + (data?.invoices.unmatched || 0);
  const openWaybills = (data?.waybills.ambiguous || 0) + (data?.waybills.unmatched || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <GitMerge className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Inteligencia operacional · OC → recepción → factura</h2>
          <Badge variant="outline">Solo candidatos</Badge>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Cruce determinístico de evidencia Laudus por proveedor, producto, cantidad, bodega, fecha y precio. Un empate nunca se convierte en match automático.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.invoices.exact_candidate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Facturas con candidato exacto</p>
        </div>
        <div className="bg-card p-4">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(openInvoices)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Facturas para revisar</p>
        </div>
        <div className="bg-card p-4">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(data?.waybills.exact_candidate)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Guías con candidato exacto</p>
        </div>
        <div className="bg-card p-4">
          <AlertTriangle className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : n(openWaybills)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Guías para revisar</p>
        </div>
      </div>

      {!isLoading && data ? (
        <div className="grid gap-px border-t bg-border md:grid-cols-2">
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Facturas</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {n(data.invoices.with_lines)} con detalle · {n(data.invoices.ambiguous)} ambiguas · {n(data.invoices.price_review)} con diferencia de precio · {n(data.invoices.unmatched)} sin OC candidata.
            </p>
          </div>
          <div className="bg-card p-4">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
              <p className="text-sm font-medium">Recepciones / guías</p>
            </div>
            <p className="mt-2 text-xs leading-5 text-muted-foreground">
              {n(data.waybills.with_lines)} con detalle · {n(data.waybills.ambiguous)} ambiguas · {n(data.waybills.unmatched)} sin OC candidata.
            </p>
          </div>
        </div>
      ) : null}

      {!isLoading && data?.threeWay ? (
        <div className="border-t">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Three-way match por línea</p>
            <p className="text-xs text-muted-foreground">OC → recepción → factura con evidencia y margen de ambigüedad. No aprueba pagos ni modifica documentos.</p>
          </div>
          <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
            <div className="bg-card p-4">
              <p className="text-2xl font-semibold">{n(data.threeWay.invoice_lines.exact_invoice_lines + data.threeWay.invoice_lines.probable_invoice_lines)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Líneas de factura con OC fuerte</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-2xl font-semibold">{n(data.threeWay.invoice_lines.three_way_lines)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Cadenas OC + recepción + factura</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-2xl font-semibold">{n(data.threeWay.invoice_lines.ambiguous_invoice_lines)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Líneas ambiguas</p>
            </div>
            <div className="bg-card p-4">
              <p className="text-2xl font-semibold">{n(data.threeWay.invoice_lines.unmatched_invoice_lines)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Líneas sin OC candidata</p>
            </div>
          </div>
        </div>
      ) : null}

      {!isLoading && data?.exceptions?.length ? (
        <div className="border-t">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Qué necesita atención</p>
            <p className="text-xs text-muted-foreground">Excepciones recientes dentro de los últimos {data.scope_days} días.</p>
          </div>
          <div className="divide-y">
            {data.exceptions.slice(0, 8).map((item) => (
              <div key={item.document_type + ':' + item.external_id} className="grid gap-2 px-4 py-3 md:grid-cols-[130px_1fr_140px_130px] md:items-center">
                <div>
                  <p className="text-sm font-medium">{item.document_type === 'invoice' ? 'Factura' : 'Guía'} {item.doc_number || item.external_id}</p>
                  <p className="text-xs text-muted-foreground">{date(item.issued_date)}</p>
                </div>
                <p className="truncate text-sm">{item.supplier_name || 'Proveedor sin nombre'}</p>
                <Badge variant="outline" className="w-fit">{statusLabel[item.status]}</Badge>
                <p className="text-xs text-muted-foreground md:text-right">
                  {item.ambiguous_lines > 0 ? n(item.ambiguous_lines) + ' líneas ambiguas' : item.price_review_lines > 0 ? n(item.price_review_lines) + ' precios a revisar' : n(item.unmatched_lines) + ' líneas sin match'}
                </p>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
