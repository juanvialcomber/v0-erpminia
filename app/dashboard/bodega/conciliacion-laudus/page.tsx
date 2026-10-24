'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, CheckCircle2, GitCompareArrows, Warehouse } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type QueueRow = {
  product_external_id: string;
  sku: string | null;
  product_name: string;
  category: string | null;
  unit_of_measure: string | null;
  laudus_quantity: number;
  motil_quantity: number | null;
  difference: number | null;
  relative_difference_pct: number | null;
  reconciliation_state: 'product_unresolved' | 'missing_motil_inventory' | 'motil_zero_baseline' | 'quantity_difference';
  review_reason: string;
};

type WarehouseCandidate = {
  laudus_warehouse_external_id: string;
  laudus_warehouse_name: string;
  motil_warehouse_id: string;
  motil_warehouse_name: string;
  comparable_products: number;
  both_nonzero: number;
  exact_nonzero: number;
  exact_nonzero_pct: number | null;
  evidence_level: 'strong_candidate' | 'candidate' | 'insufficient_evidence';
};

type Payload = {
  generatedAt: string;
  summary: {
    stockRows: number;
    sourceWarehouses: number;
    mappedWarehouses: number;
    unresolvedWarehouseMappings: number;
    productsWithStock: number;
    matchedProductsWithStock: number;
    unresolvedProductsWithStock: number;
    comparedProducts: number;
    exactQuantityMatches: number;
    quantityDifferences: number;
    missingMotilInventoryRows: number;
    latestSyncStatus: string | null;
    latestSyncAt: string | null;
    motilSnapshotDate: string | null;
    freshnessComparable: boolean;
  };
  queue: QueueRow[];
  warehouseCandidates: WarehouseCandidate[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la conciliación Laudus.');
  return payload as Payload;
};

const n = (value: number | null | undefined) =>
  value == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value);

const stateLabel: Record<QueueRow['reconciliation_state'], string> = {
  product_unresolved: 'Producto sin resolver',
  missing_motil_inventory: 'Sin inventario MOTIL',
  motil_zero_baseline: 'Baseline MOTIL en cero',
  quantity_difference: 'Cantidad distinta',
};

export default function LaudusInventoryReconciliationPage() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/inventory-reconciliation?limit=100',
    fetcher,
    { revalidateOnFocus: false },
  );

  if (isLoading) return <StatePanel tone="loading" title="Cargando conciliación Laudus" description="Comparando evidencia ERP con inventario MOTIL sin modificar saldos." />;
  if (error || !data) return <StatePanel tone="error" title="Conciliación no disponible" description={error?.message || 'No fue posible leer la conciliación.'} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;

  const s = data.summary;

  return (
    <div className="space-y-6">
      <header className="border-b border-border/70 pb-4">
        <Button asChild variant="ghost" size="sm" className="-ml-2 mb-2"><Link href="/dashboard/bodega"><ArrowLeft className="h-4 w-4" />Bodega</Link></Button>
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Bodega · Laudus</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Conciliación de inventario</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Laudus aporta saldo ERP como evidencia. MOTIL conserva el stock operacional y no aplica diferencias automáticamente.</p>
      </header>

      <section className="grid overflow-hidden rounded-lg border sm:grid-cols-2 xl:grid-cols-4">
        {[
          ['Filas Laudus', s.stockRows],
          ['Productos comparados', s.comparedProducts],
          ['Coincidencias exactas', s.exactQuantityMatches],
          ['Diferencias', s.quantityDifferences],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{n(Number(value))}</p>
          </div>
        ))}
      </section>

      <section className="grid gap-3 md:grid-cols-3">
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2"><Warehouse className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-medium">Bodegas Laudus</p></div>
          <p className="mt-2 text-2xl font-semibold">{s.sourceWarehouses}</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.mappedWarehouses} vinculadas · {s.unresolvedWarehouseMappings} requieren definición humana.</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-medium">Productos resueltos</p></div>
          <p className="mt-2 text-2xl font-semibold">{n(s.matchedProductsWithStock)}</p>
          <p className="mt-1 text-xs text-muted-foreground">{n(s.unresolvedProductsWithStock)} productos con stock siguen sin identidad canónica.</p>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" /><p className="text-sm font-medium">Sin posición MOTIL</p></div>
          <p className="mt-2 text-2xl font-semibold">{n(s.missingMotilInventoryRows)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Producto identificado en Laudus, pero sin fila vigente de inventario MOTIL.</p>
        </div>
      </section>

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Equivalencia de bodegas</h2><p className="text-sm text-muted-foreground">Evidencia para revisión humana; ninguna equivalencia se confirma automáticamente.</p></div>
        <div className="overflow-hidden rounded-lg border bg-card">
          {data.warehouseCandidates.map((row) => (
            <div key={row.laudus_warehouse_external_id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[140px_1fr_180px_140px_180px] lg:items-center lg:gap-4">
              <p className="font-mono text-sm">{row.laudus_warehouse_external_id}</p>
              <div><p className="text-sm font-medium">{row.laudus_warehouse_name}</p><p className="text-xs text-muted-foreground">Candidata MOTIL: {row.motil_warehouse_name}</p></div>
              <p className="text-sm tabular-nums">{n(row.both_nonzero)} productos comparables</p>
              <p className="text-sm font-medium tabular-nums">{row.exact_nonzero_pct == null ? '—' : `${n(row.exact_nonzero_pct)}%`} exactos</p>
              <Badge variant={row.evidence_level === 'strong_candidate' ? 'secondary' : 'outline'}>
                {row.evidence_level === 'strong_candidate' ? 'Candidata fuerte' : row.evidence_level === 'candidate' ? 'Candidata' : 'Evidencia insuficiente'}
              </Badge>
            </div>
          ))}
        </div>
      </section>

      {!s.freshnessComparable ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Fuentes con distinta fecha</p>
            <p className="mt-1 text-muted-foreground">MOTIL está comparando contra el snapshot {s.motilSnapshotDate ? new Date(`${s.motilSnapshotDate}T00:00:00Z`).toLocaleDateString('es-CL', { timeZone: 'UTC' }) : 'sin fecha'}; Laudus fue actualizado recientemente. Las diferencias sirven para revisión, no para declarar errores de stock.</p>
          </div>
        </div>
      ) : null}

      {s.unresolvedWarehouseMappings > 0 ? (
        <div className="flex gap-3 rounded-lg border border-amber-500/30 bg-amber-500/5 p-4 text-sm">
          <GitCompareArrows className="mt-0.5 h-4 w-4 shrink-0" />
          <div><p className="font-medium">Mapeo de bodegas pendiente</p><p className="mt-1 text-muted-foreground">No se atribuyen diferencias a una bodega MOTIL específica hasta confirmar equivalencias. La comparación actual agrega stock Laudus por producto.</p></div>
        </div>
      ) : null}

      <section className="space-y-3">
        <div><h2 className="text-lg font-semibold">Requiere revisión</h2><p className="text-sm text-muted-foreground">Primero identidad y baseline; después diferencias relativas. La unidad siempre se conserva.</p></div>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="hidden grid-cols-[120px_1fr_120px_120px_130px_170px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
            <span>Código</span><span>Producto</span><span>Laudus</span><span>MOTIL</span><span>Variación</span><span>Estado</span>
          </div>
          {data.queue.map((row) => (
            <div key={row.product_external_id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[120px_1fr_120px_120px_130px_170px] lg:items-center lg:gap-4">
              <p className="font-mono text-sm">{row.sku || row.product_external_id}</p>
              <div className="min-w-0">
                <p className="text-sm font-medium">{row.product_name}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {[row.category, row.unit_of_measure].filter(Boolean).join(' · ') || 'Sin unidad declarada'}
                </p>
                <p className="mt-1 text-xs text-muted-foreground lg:hidden">{row.review_reason}</p>
              </div>
              <p className="text-sm tabular-nums"><span className="text-muted-foreground lg:hidden">Laudus: </span>{n(row.laudus_quantity)}{row.unit_of_measure ? ` ${row.unit_of_measure}` : ''}</p>
              <p className="text-sm tabular-nums"><span className="text-muted-foreground lg:hidden">MOTIL: </span>{n(row.motil_quantity)}</p>
              <div>
                <p className="text-sm font-medium tabular-nums"><span className="text-muted-foreground lg:hidden">Diferencia: </span>{n(row.difference)}</p>
                {row.relative_difference_pct != null ? <p className="text-xs text-muted-foreground">{n(row.relative_difference_pct)}%</p> : null}
              </div>
              <div>
                <Badge variant={row.reconciliation_state === 'quantity_difference' ? 'secondary' : 'outline'}>{stateLabel[row.reconciliation_state]}</Badge>
                <p className="mt-1 hidden text-xs leading-4 text-muted-foreground lg:block">{row.review_reason}</p>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
