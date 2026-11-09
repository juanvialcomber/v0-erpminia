'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, ArrowRight, Boxes } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Row = {
  productId: string | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  operationalCategory: string | null;
  laudusStock: number | null;
  motilStock: number | null;
  delta: number | null;
  reconciliationState: 'missing_in_motil' | 'quantity_mismatch';
  priority: number;
  recentPurchase: boolean;
  purchaseOrderCount: number | null;
  lastPurchaseDate: string | null;
  daysSinceLastPurchase: number | null;
};

type Payload = {
  rows: Row[];
  summary: { prioritized: number; negative: number; process: number; maintenance: number; other: number };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la prioridad Laudus.');
  return payload;
};

const number = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(parsed) : '—';
};

function label(row: Row) {
  if (Number(row.laudusStock || 0) < 0) return 'Negativo';
  if (row.operationalCategory === 'process_consumable') return 'Proceso';
  if (row.operationalCategory === 'maintenance_supply') return 'Mantención';
  return 'Revisar';
}

export function LaudusInventoryPriorityQueue() {
  const { data, error, isLoading } = useSWR<Payload>('/api/integrations/laudus/inventory-priority', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <section className="h-40 animate-pulse rounded-lg bg-muted" />;

  if (error) {
    return <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</section>;
  }

  const rows = data?.rows || [];
  if (!rows.length) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-2">
          <Boxes className="mt-0.5 h-4 w-4" />
          <div>
            <p className="text-sm font-medium">Sin brechas Laudus prioritarias</p>
            <p className="mt-1 text-xs text-muted-foreground">Las diferencias restantes son de baja materialidad o no tienen evidencia reciente de compra.</p>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Prioridad Laudus</p>
            <h2 className="mt-1 text-lg font-semibold">Casos que sí requieren atención</h2>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Sólo se muestran diferencias materiales con compras durante los últimos 12 meses. El backlog menor queda fuera de la cola diaria.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{number(data?.summary.prioritized)} priorizados</p>
            <p>{number(data?.summary.negative)} negativos · {number(data?.summary.process)} proceso · {number(data?.summary.maintenance)} mantención</p>
          </div>
        </div>
      </div>

      <div className="divide-y">
        {rows.slice(0, 12).map((row) => (
          <Link
            key={row.productId || row.sku || row.description}
            href={row.productId ? `/dashboard/bodega/productos/${row.productId}` : '/dashboard/bodega'}
            className="grid gap-3 px-4 py-3 transition-colors hover:bg-muted/40 md:grid-cols-[110px_1fr_150px_150px_32px] md:items-center"
          >
            <div>
              <Badge variant={Number(row.laudusStock || 0) < 0 ? 'destructive' : 'outline'}>{label(row)}</Badge>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">{row.sku || 'Sin SKU'}</p>
            </div>
            <div>
              <p className="text-sm font-medium">{row.description || 'Producto sin descripción'}</p>
              <p className="mt-1 text-xs text-muted-foreground">{number(row.purchaseOrderCount)} OC · última compra {row.lastPurchaseDate || 'sin fecha'}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">Laudus</p>
              <p className="font-semibold tabular-nums">{number(row.laudusStock)} {row.unit || ''}</p>
            </div>
            <div className="text-sm">
              <p className="text-xs text-muted-foreground">{row.reconciliationState === 'missing_in_motil' ? 'MOTIL' : 'Diferencia'}</p>
              <p className="font-semibold tabular-nums">
                {row.reconciliationState === 'missing_in_motil' ? 'Sin saldo' : `${Number(row.delta || 0) > 0 ? '+' : ''}${number(row.delta)} ${row.unit || ''}`}
              </p>
            </div>
            <ArrowRight className="hidden h-4 w-4 text-muted-foreground md:block" />
          </Link>
        ))}
      </div>

      <div className="flex items-start gap-2 border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <p>Esta cola prioriza revisión; no corrige stock ni adopta Laudus como conteo físico. La resolución sigue requiriendo evidencia y decisión humana.</p>
      </div>
    </section>
  );
}
