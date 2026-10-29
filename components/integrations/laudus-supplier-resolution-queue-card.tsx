'use client';

import useSWR from 'swr';
import { Users } from 'lucide-react';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type QueueRow = {
  supplier_name_key: string;
  display_name: string;
  purchase_order_count: number;
  first_order_date: string | null;
  last_order_date: string | null;
  currency_count: number;
  single_currency: string | null;
  total_amount_single_currency: number | null;
};

type Payload = {
  unresolvedNames: number;
  rows: QueueRow[];
  policy: 'review_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la cola de proveedores.');
  return payload;
};

export function LaudusSupplierResolutionQueueCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/supplier-resolution-queue',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-4">
        <div>
          <LaudusSourceMark state={isLoading ? 'syncing' : data ? 'connected' : 'pending'} className="mb-2" />
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Proveedores históricos por resolver</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Nombres presentes en OC que todavía no tienen una identidad canónica verificable.
          </p>
        </div>
        <p className="text-2xl font-semibold">{isLoading || !data ? '—' : data.unresolvedNames.toLocaleString('es-CL')}</p>
      </div>

      <div className="divide-y">
        {(data?.rows || []).slice(0, 8).map((row) => (
          <div key={row.supplier_name_key} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{row.display_name}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {row.first_order_date || '—'} → {row.last_order_date || '—'}
              </p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-semibold">{row.purchase_order_count.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">OC</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        MOTIL no crea ni enlaza proveedores desde esta lista. Requiere RUT/código Laudus u otra evidencia determinística.
      </div>
    </section>
  );
}
