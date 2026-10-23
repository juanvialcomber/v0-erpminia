'use client';

import useSWR from 'swr';
import { CheckCircle2, ReceiptText, ShoppingCart, Truck, Users } from 'lucide-react';
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
  purchase_orders: { total: number; synced_at: string | null };
  waybills: { total: number; synced_at: string | null };
  invoices: { total: number; synced_at: string | null };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar Laudus.');
  return payload;
};

const number = (value: number | undefined) =>
  typeof value === 'number' ? new Intl.NumberFormat('es-CL').format(value) : '—';

export function LaudusProcurementLiveCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/procurement-live',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error) return null;

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
        </div>
        <div className="bg-card p-4">
          <Truck className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.waybills.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Recepciones / guías</p>
        </div>
        <div className="bg-card p-4">
          <ReceiptText className="h-4 w-4 text-muted-foreground" />
          <p className="mt-2 text-2xl font-semibold">{isLoading ? '—' : number(data?.invoices.total)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Facturas Laudus</p>
        </div>
      </div>

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
