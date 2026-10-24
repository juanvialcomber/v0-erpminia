'use client';

import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, Users } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type QueueRow = {
  supplier_name_key: string;
  display_name: string;
  purchase_order_count: number;
  first_order_date: string | null;
  last_order_date: string | null;
  proposed_canonical_supplier_name: string | null;
  proposed_canonical_supplier_tax_id: string | null;
  resolution_status: 'tax_verified_exact' | 'source_placeholder' | 'ambiguous' | 'unresolved';
  resolution_method: string;
  evaluated_at: string;
};

type Payload = {
  totalNames: number;
  verifiedNames: number;
  placeholderNames: number;
  unresolvedNames: number;
  ambiguousNames: number;
  verifiedOrders: number;
  placeholderOrders: number;
  rows: QueueRow[];
  method: string;
  canonicalMutated: false;
  policy: 'review_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la identidad de proveedores.');
  return payload;
};

export function LaudusSupplierResolutionQueueCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/integrations/laudus/supplier-resolution-queue',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  const trulyOpen = (data?.unresolvedNames || 0) + (data?.ambiguousNames || 0);

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex items-center gap-2">
          <Users className="h-4 w-4 text-muted-foreground" />
          <h2 className="text-sm font-semibold">Identidad de proveedores históricos</h2>
        </div>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          MOTIL usa el nombre histórico sólo para llegar al proveedor Laudus; la identidad propuesta se valida contra el mismo RUT del proveedor canónico.
        </p>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">
            {isLoading || !data ? '—' : data.verifiedNames.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">Nombres con RUT verificado</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">
            {isLoading || !data ? '—' : data.verifiedOrders.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">OC candidatas</p>
        </div>
        <div className="bg-card p-4">
          <div className="flex items-center gap-2">
            {trulyOpen === 0 ? (
              <CheckCircle2 className="h-4 w-4 text-muted-foreground" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-muted-foreground" />
            )}
            <p className="text-2xl font-semibold">
              {isLoading || !data ? '—' : trulyOpen.toLocaleString('es-CL')}
            </p>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Proveedores reales sin resolver</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">
            {isLoading || !data ? '—' : data.placeholderOrders.toLocaleString('es-CL')}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">OC placeholder de fuente</p>
        </div>
      </div>

      <div className="divide-y border-t">
        {(data?.rows || []).slice(0, 8).map((row) => (
          <div key={row.supplier_name_key} className="grid gap-3 px-4 py-3 md:grid-cols-[1fr_auto] md:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-sm font-medium">{row.display_name}</p>
                {row.resolution_status === 'tax_verified_exact' ? (
                  <Badge variant="secondary">RUT verificado</Badge>
                ) : row.resolution_status === 'source_placeholder' ? (
                  <Badge variant="outline">Calidad de fuente</Badge>
                ) : (
                  <Badge variant="outline">Revisión</Badge>
                )}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.resolution_status === 'tax_verified_exact'
                  ? (row.proposed_canonical_supplier_name || 'Proveedor canónico') + ' · RUT ' + (row.proposed_canonical_supplier_tax_id || '—')
                  : 'Registro heredado sin identidad comercial utilizable.'}
              </p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {row.first_order_date || '—'} → {row.last_order_date || '—'}
              </p>
            </div>
            <div className="text-left md:text-right">
              <p className="text-sm font-semibold">{row.purchase_order_count.toLocaleString('es-CL')}</p>
              <p className="text-xs text-muted-foreground">OC</p>
            </div>
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        Vista de evidencia. MOTIL no modifica todavía el proveedor de las OC históricas.
      </div>
    </section>
  );
}
