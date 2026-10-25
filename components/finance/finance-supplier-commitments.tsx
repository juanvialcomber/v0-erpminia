'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

type SupplierCommitment = {
  supplier_id?: string | null;
  supplier_tax_id?: string | null;
  supplier_name?: string | null;
  purchase_order_count?: number | string | null;
  line_count?: number | string | null;
  committed_clp?: number | string | null;
};

type FinanceExecutiveResponse = { topSuppliers?: SupplierCommitment[] };

const fetcher = async (url: string): Promise<FinanceExecutiveResponse> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la concentración de compras');
  return payload;
};

const number = (value: unknown) => {
  const numeric = Number(value || 0);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('es-CL').format(numeric) : '—';
};

const money = (value: unknown) => {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return '—';
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(numeric);
};

export function FinanceSupplierCommitments() {
  const { data, error, isLoading, mutate } = useSWR<FinanceExecutiveResponse>(
    '/api/finance/executive',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );
  const sourceRows = data?.topSuppliers || [];
  const ranked = [...sourceRows]
    .sort((left, right) => Number(right.committed_clp || 0) - Number(left.committed_clp || 0))
    .slice(0, 5);
  const unlinked = sourceRows.filter((row) => !row.supplier_id).length;

  return (
    <section aria-labelledby="supplier-commitments-title">
      <Card className="shadow-none">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1">
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Compras por proveedor</p>
            <CardTitle id="supplier-commitments-title" className="text-lg">Proveedores con mayores compras</CardTitle>
            <CardDescription className="max-w-3xl">
              El monto corresponde a órdenes de compra; no significa que la factura esté aprobada ni que el pago se haya realizado.
            </CardDescription>
          </div>
          {!isLoading && !error && sourceRows.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              <Badge variant="outline">{ranked.length} proveedores</Badge>
              {unlinked > 0 ? <Badge variant="outline">{unlinked} sin ficha</Badge> : null}
            </div>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-3">
          {isLoading ? <p className="py-3 text-sm text-muted-foreground">Cargando compras...</p> : null}
          {error ? (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/5 p-3">
              <p className="text-sm text-destructive">No fue posible cargar los datos de compras.</p>
              <Button variant="outline" size="sm" onClick={() => void mutate()}>Reintentar</Button>
            </div>
          ) : null}
          {!isLoading && !error && ranked.length === 0 ? (
            <p className="py-3 text-sm text-muted-foreground">No hay compras para mostrar.</p>
          ) : null}
          {ranked.map((row, index) => {
            const linked = Boolean(row.supplier_id);
            const supplierName = row.supplier_name || 'Proveedor sin nombre en la orden';
            const content = (
              <div className="grid gap-2 rounded-md border px-3 py-3 transition-colors sm:grid-cols-[32px_minmax(0,1fr)_auto] sm:items-center">
                <span className="text-sm tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</span>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{supplierName}</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {number(row.purchase_order_count)} órdenes · {number(row.line_count)} líneas ·{' '}
                    {row.supplier_tax_id && row.supplier_tax_id !== 'SIN-RUT'
                      ? `RUT ${row.supplier_tax_id}`
                      : 'RUT no disponible'}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  <Badge variant={linked ? 'secondary' : 'outline'}>
                    {linked ? 'Tiene ficha de proveedor' : 'Falta ficha de proveedor'}
                  </Badge>
                  <p className="text-sm font-semibold tabular-nums">{money(row.committed_clp)}</p>
                </div>
              </div>
            );

            return linked ? (
              <Link
                key={`${row.supplier_id}-${index}`}
                href={`/dashboard/finanzas/proveedores/${row.supplier_id}`}
                className="block rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                aria-label={`Abrir ficha de ${supplierName}`}
              >
                {content}
              </Link>
            ) : <div key={`${supplierName}-${index}`}>{content}</div>;
          })}
          {!isLoading && !error && sourceRows.length > 0 ? (
            <p className="pt-1 text-xs text-muted-foreground">
              Los nombres que aún no tienen ficha se mantienen separados para evitar unir proveedores distintos por error.
            </p>
          ) : null}
        </CardContent>
      </Card>
    </section>
  );
}
