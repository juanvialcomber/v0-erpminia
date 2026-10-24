'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Link2, WalletCards } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type Review = {
  purchase_invoice_external_id: string;
  laudus_purchase_invoice_id: number;
  doc_number: string | null;
  supplier_name: string | null;
  issued_date: string | null;
  due_date: string | null;
  total_amount: number;
  paid_amount: number;
  outstanding_amount: number;
  currency: string;
  payment_count: number;
  last_payment_at: string | null;
  payment_status: string | null;
  days_overdue: number;
  review_reason: string;
};

type SupplierExposure = {
  supplier_external_id: string;
  supplier_name: string | null;
  open_invoices: number;
  overdue_invoices: number;
  outstanding_amount: number;
  overdue_amount: number;
  currency: string;
};

type Payload = {
  source: 'Laudus';
  read_only: true;
  summary: {
    invoice_count: number;
    open_count: number;
    open_amount: number;
    overdue_count: number;
    overdue_amount: number;
    no_due_date_count: number;
  };
  trace_coverage: {
    invoices_total: number;
    invoices_scanned: number;
    trace_rows: number;
    exact_purchase_order: number;
    exact_waybill: number;
    ambiguous: number;
    unresolved: number;
  };
  reviews: Review[];
  supplier_exposure: SupplierExposure[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la revisión financiera');
  return payload;
};

const money = (value: unknown, currency = 'CLP') => {
  const numeric = Number(value || 0);
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(numeric);
  } catch {
    return `${currency} ${numeric.toLocaleString('es-CL')}`;
  }
};

const number = (value: unknown) => Number(value || 0).toLocaleString('es-CL');

const reasonVariant = (reason: string) =>
  reason === 'Vencida' ? 'destructive' as const : reason === 'Vence pronto' ? 'secondary' as const : 'outline' as const;

export default function LaudusFinanceReviewPage() {
  const { data, error, isLoading } = useSWR<Payload>('/api/integrations/laudus/finance-review', fetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });

  const summary = data?.summary;
  const trace = data?.trace_coverage;
  const tracePct = trace?.invoices_total ? (trace.invoices_scanned / trace.invoices_total) * 100 : 0;

  return (
    <div className="space-y-6">
      <section className="border-b pb-5">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Finanzas · Laudus</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Revisiones financieras</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Prioriza excepciones con evidencia ERP. Esta vista no aprueba, paga ni contabiliza.
        </p>
      </section>

      {error ? <div className="rounded-lg border border-destructive/30 p-3 text-sm text-destructive">{error.message}</div> : null}

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="shadow-none"><CardContent className="p-5"><WalletCards className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-2xl font-semibold">{isLoading || !summary ? '—' : number(summary.open_count)}</p><p className="text-xs text-muted-foreground">Facturas con saldo</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-5"><AlertTriangle className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-2xl font-semibold">{isLoading || !summary ? '—' : number(summary.overdue_count)}</p><p className="text-xs text-muted-foreground">Vencidas</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Saldo abierto</p><p className="mt-2 text-xl font-semibold">{isLoading || !summary ? '—' : money(summary.open_amount)}</p></CardContent></Card>
        <Card className="shadow-none"><CardContent className="p-5"><p className="text-xs text-muted-foreground">Saldo vencido</p><p className="mt-2 text-xl font-semibold">{isLoading || !summary ? '—' : money(summary.overdue_amount)}</p></CardContent></Card>
      </section>

      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base"><Link2 className="h-4 w-4"/>Cobertura documental</CardTitle>
          <CardDescription>Three-way match OC → recepción/guía → factura. Se habilita sólo con trazas exactas Laudus.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-3xl font-semibold">{isLoading || !trace ? '—' : `${tracePct.toLocaleString('es-CL',{maximumFractionDigits:1})}%`}</p><p className="text-sm text-muted-foreground">{trace ? `${number(trace.invoices_scanned)} de ${number(trace.invoices_total)} facturas trazadas` : 'Calculando cobertura'}</p></div>
            <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-sm text-muted-foreground">
              <span>OC exactas</span><strong className="text-right text-foreground">{trace ? number(trace.exact_purchase_order) : '—'}</strong>
              <span>Guías exactas</span><strong className="text-right text-foreground">{trace ? number(trace.exact_waybill) : '—'}</strong>
              <span>Ambiguas</span><strong className="text-right text-foreground">{trace ? number(trace.ambiguous) : '—'}</strong>
              <span>No resueltas</span><strong className="text-right text-foreground">{trace ? number(trace.unresolved) : '—'}</strong>
            </div>
          </div>
          {trace && trace.invoices_scanned === 0 ? <p className="mt-4 text-sm text-amber-700 dark:text-amber-400">La estructura está lista, pero aún no se ha ejecutado el barrido de trazas Laudus. No se infieren relaciones documentales.</p> : null}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle>Qué revisar primero</CardTitle><CardDescription>Orden determinístico: vencida → sin vencimiento → vence pronto → abierta; luego mayor saldo.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {!isLoading && !data?.reviews.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay obligaciones abiertas para revisión.</p> : null}
          {(data?.reviews || []).map((row) => (
            <div key={row.purchase_invoice_external_id} className="grid gap-2 rounded-lg border p-4 lg:grid-cols-[140px_1fr_150px_150px] lg:items-center">
              <div><Badge variant={reasonVariant(row.review_reason)}>{row.review_reason}</Badge><p className="mt-1 text-xs text-muted-foreground">{row.days_overdue > 0 ? `${row.days_overdue} días vencida` : row.due_date ? `Vence ${row.due_date.slice(0,10)}` : 'Sin vencimiento'}</p></div>
              <div className="min-w-0"><p className="truncate font-medium">{row.supplier_name || 'Proveedor sin nombre'}</p><p className="text-xs text-muted-foreground">Factura {row.doc_number || row.purchase_invoice_external_id} · emitida {row.issued_date ? row.issued_date.slice(0,10) : '—'}</p></div>
              <div className="text-sm lg:text-right"><p className="font-semibold">{money(row.outstanding_amount,row.currency || 'CLP')}</p><p className="text-xs text-muted-foreground">saldo</p></div>
              <div className="text-sm lg:text-right"><p>{number(row.payment_count)} pago(s)</p><p className="text-xs text-muted-foreground">{row.last_payment_at ? `último ${row.last_payment_at.slice(0,10)}` : 'sin pago'}</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader><CardTitle>Exposición por proveedor</CardTitle><CardDescription>Concentración de saldo abierto; no es un score crediticio.</CardDescription></CardHeader>
        <CardContent className="space-y-2">
          {(data?.supplier_exposure || []).map((row,index) => (
            <div key={row.supplier_external_id} className="grid gap-2 border-b py-3 last:border-b-0 sm:grid-cols-[32px_1fr_160px_160px] sm:items-center">
              <span className="text-sm text-muted-foreground">{index+1}</span>
              <div><p className="font-medium">{row.supplier_name || 'Proveedor'}</p><p className="text-xs text-muted-foreground">{number(row.open_invoices)} abiertas · {number(row.overdue_invoices)} vencidas</p></div>
              <div className="text-sm sm:text-right"><p className="font-semibold">{money(row.outstanding_amount,row.currency || 'CLP')}</p><p className="text-xs text-muted-foreground">saldo</p></div>
              <div className="text-sm sm:text-right"><p className="font-semibold">{money(row.overdue_amount,row.currency || 'CLP')}</p><p className="text-xs text-muted-foreground">vencido</p></div>
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="flex items-center gap-2 text-xs text-muted-foreground"><CheckCircle2 className="h-4 w-4"/>Fuente: Laudus · lectura y priorización únicamente · aprobación humana obligatoria.</div>
    </div>
  );
}
