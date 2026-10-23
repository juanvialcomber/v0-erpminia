'use client';

import useSWR from 'swr';
import { CalendarClock, FileText, Landmark, TriangleAlert } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Payload = {
  invoices: {
    total: number;
    lines: number;
    with_due_date: number;
    without_due_date: number;
    past_due_date: number;
    future_issued_date: number;
    missing_supplier_tax_id: number;
    latest_issued_date: string | null;
    synced_at: string | null;
    recent: Array<{
      external_id: string;
      laudus_purchase_invoice_id: number | null;
      doc_number: string | null;
      supplier_name: string | null;
      supplier_tax_id: string | null;
      issued_date: string | null;
      due_date: string | null;
      warehouse_name: string | null;
      quality_flags: string[];
    }>;
  };
  policy: {
    source: 'Laudus';
    read_only: true;
    invoice_is_not_payment: true;
    past_due_date_is_not_payment_status: true;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Laudus.');
  return payload;
};

const number = (value: number | undefined) =>
  typeof value === 'number' ? new Intl.NumberFormat('es-CL').format(value) : '—';

const date = (value: string | null | undefined) =>
  value
    ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value))
    : '—';

export function LaudusFinanceLiveCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/finance-live',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  const qualityIssues =
    (data?.invoices.future_issued_date || 0) +
    (data?.invoices.missing_supplier_tax_id || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Landmark className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Laudus · documentos financieros reales</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Facturas de compra persistidas desde el ERP. Una factura no equivale a pago ni una fecha vencida prueba deuda pendiente.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.invoices.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Facturas Laudus</p>
          <p className="mt-2 text-xs text-muted-foreground">{isLoading ? '—' : number(data?.invoices.lines)} líneas de producto</p>
        </div>
        <div className="bg-card p-4">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.invoices.with_due_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Con vencimiento registrado</p>
        </div>
        <div className="bg-card p-4">
          <CalendarClock className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.invoices.past_due_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Fecha de vencimiento anterior a hoy</p>
          <p className="mt-2 text-xs text-muted-foreground">No implica saldo pendiente.</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-xs text-muted-foreground">Última factura emitida</p>
          <p className="mt-2 text-lg font-semibold">{isLoading ? '—' : date(data?.invoices.latest_issued_date)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Laudus · lectura</p>
        </div>
      </div>

      {!isLoading && qualityIssues > 0 ? (
        <div className="flex items-start gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {number(data?.invoices.future_issued_date)} factura(s) con fecha futura y {number(data?.invoices.missing_supplier_tax_id)} sin RUT de proveedor. Permanecen como excepciones.
          </p>
        </div>
      ) : null}

      {!isLoading && data?.invoices.recent?.length ? (
        <div className="border-t">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Facturas recientes Laudus</p>
            <p className="text-xs text-muted-foreground">Documento, proveedor, emisión, vencimiento y bodega desde la fuente ERP.</p>
          </div>
          <div className="divide-y">
            {data.invoices.recent.map((invoice) => (
              <div key={invoice.external_id} className="grid gap-2 px-4 py-3 md:grid-cols-[140px_1fr_150px_120px] md:items-center">
                <div>
                  <p className="font-mono text-sm">{invoice.doc_number || 'Sin número'}</p>
                  <p className="text-xs text-muted-foreground">ID {invoice.laudus_purchase_invoice_id ?? invoice.external_id}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{invoice.supplier_name || 'Proveedor sin nombre'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{invoice.supplier_tax_id || 'Sin RUT'} · {invoice.warehouse_name || 'Sin bodega'}</p>
                </div>
                <p className="text-xs text-muted-foreground">Emisión {date(invoice.issued_date)}</p>
                <div className="md:text-right">
                  <Badge variant="outline">Vence {date(invoice.due_date)}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
