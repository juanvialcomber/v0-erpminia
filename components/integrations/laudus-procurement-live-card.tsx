'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ReceiptText, ShoppingCart, Truck, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Payload = {
  suppliers: {
    total: number;
    matched: number;
    new_candidate: number;
    conflict: number;
    synced_at: string | null;
    new_items: Array<{
      external_id: string;
      laudus_supplier_id: number | null;
      tax_id: string | null;
      name: string | null;
      legal_name: string | null;
      city: string | null;
      email: string | null;
      phone: string | null;
    }>;
  };
  purchase_orders: {
    total: number;
    lines: number;
    future_dates: number;
    missing_supplier_tax_id: number;
    latest_issued_date: string | null;
    synced_at: string | null;
    recent: Array<{
      external_id: string;
      laudus_purchase_order_id: number | null;
      issued_date: string | null;
      due_date: string | null;
      status: string | null;
      supplier_name: string | null;
      supplier_tax_id: string | null;
      warehouse_name: string | null;
      quality_flags: string[];
    }>;
  };
  waybills: { total: number; lines: number; synced_at: string | null };
  invoices: { total: number; lines: number; synced_at: string | null };
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
    ? new Intl.DateTimeFormat('es-CL', {
        dateStyle: 'medium',
        timeZone: 'America/Santiago',
      }).format(new Date(value))
    : '—';

export function LaudusProcurementLiveCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/procurement-live',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

  const orderIssues =
    (data?.purchase_orders.future_dates || 0) +
    (data?.purchase_orders.missing_supplier_tax_id || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Laudus · datos reales</h2>
        </div>
        <p className="mt-1 text-xs text-muted-foreground">
          Fuente ERP persistida en MOTIL. Lectura solamente; no crea ni modifica proveedores, OC, recepciones o facturas canónicas.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <Users className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.suppliers.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Proveedores Laudus</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading ? '—' : number(data?.suppliers.matched)} conciliados · {isLoading ? '—' : number(data?.suppliers.new_candidate)} nuevos
          </p>
        </div>
        <div className="bg-card p-4">
          <ShoppingCart className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.purchase_orders.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">OC Laudus</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading ? '—' : number(data?.purchase_orders.lines)} líneas · desde 2025
          </p>
        </div>
        <div className="bg-card p-4">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.waybills.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recepciones / guías</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading ? '—' : number(data?.waybills.lines)} líneas persistidas
          </p>
        </div>
        <div className="bg-card p-4">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.invoices.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Facturas Laudus</p>
          <p className="mt-2 text-xs text-muted-foreground">
            {isLoading ? '—' : number(data?.invoices.lines)} líneas persistidas
          </p>
        </div>
      </div>

      {!isLoading && orderIssues > 0 ? (
        <div className="flex items-start gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <p>
            {number(data?.purchase_orders.future_dates)} OC con fecha futura y {number(data?.purchase_orders.missing_supplier_tax_id)} sin RUT de proveedor. Se mantienen como excepciones y no alimentan conclusiones automáticas.
          </p>
        </div>
      ) : null}

      {!isLoading && data?.purchase_orders.recent?.length ? (
        <div className="border-t">
          <div className="px-4 py-3">
            <p className="text-sm font-medium">Órdenes recientes Laudus</p>
            <p className="text-xs text-muted-foreground">
              Última fecha operacional válida: {date(data.purchase_orders.latest_issued_date)}.
            </p>
          </div>
          <div className="divide-y">
            {data.purchase_orders.recent.map((order) => (
              <div
                key={order.external_id}
                className="grid gap-2 px-4 py-3 md:grid-cols-[110px_1fr_150px_120px] md:items-center"
              >
                <div>
                  <p className="font-mono text-sm">OC {order.laudus_purchase_order_id ?? order.external_id}</p>
                  <p className="text-xs text-muted-foreground">{date(order.issued_date)}</p>
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{order.supplier_name || 'Proveedor sin nombre'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{order.supplier_tax_id || 'Sin RUT'} · {order.warehouse_name || 'Sin bodega'}</p>
                </div>
                <p className="text-xs text-muted-foreground">Vence {date(order.due_date)}</p>
                <div className="md:text-right">
                  <Badge variant="outline">{order.status || 'Sin estado'}</Badge>
                </div>
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {!isLoading && data?.suppliers.new_items?.length ? (
        <div className="border-t">
          <div className="flex items-center justify-between px-4 py-3">
            <div>
              <p className="text-sm font-medium">Nuevos proveedores en Laudus</p>
              <p className="text-xs text-muted-foreground">No existen aún en la base canónica MOTIL por RUT exacto.</p>
            </div>
            <Badge variant="secondary">{number(data.suppliers.new_candidate)}</Badge>
          </div>
          <div className="divide-y">
            {data.suppliers.new_items.map((supplier) => (
              <div key={supplier.external_id} className="grid gap-2 px-4 py-3 sm:grid-cols-[1fr_150px_130px] sm:items-center">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{supplier.legal_name || supplier.name || 'Proveedor sin nombre'}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{supplier.city || 'Sin ciudad'} · ID Laudus {supplier.laudus_supplier_id ?? supplier.external_id}</p>
                </div>
                <p className="font-mono text-xs text-muted-foreground">{supplier.tax_id || 'Sin RUT'}</p>
                <div className="flex items-center gap-1.5 text-xs text-muted-foreground"><CheckCircle2 className="h-3.5 w-3.5" />Revisar alta</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </section>
  );
}
