'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, RefreshCw, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

type Summary = {
  warehouse_id: string;
  source_cutoff: string | null;
  source_synced_at: string | null;
  authority_state: string | null;
  products_reviewed: number;
  existing_zero_rows_to_assign: number;
  opening_rows_to_create: number;
  already_canonical: number;
  requires_review: number;
  identity_conflicts: number;
  missing_motil_products: number;
  negative_source_products: number;
  fractional_products: number;
  stale_source_products: number;
  zero_without_opening_balance: number;
};

type PreviewRow = {
  canonical_product_id: string;
  sku: string;
  description: string | null;
  unit_of_measure: string | null;
  source_quantity: number;
  source_position_count: number;
  source_identity_count: number;
  has_negative_position: boolean;
  has_fractional_position: boolean;
  source_cutoff: string | null;
  source_synced_at: string | null;
  canonicalization_state: string;
};

type Payload = {
  summary: Summary | null;
  rows: PreviewRow[];
  count: number;
  limit: number;
  offset: number;
  readOnly: boolean;
  applied: boolean;
  error?: string;
};

const labels: Record<string, string> = {
  candidate_assign_zero_row: 'Asignar fila MOTIL vacía',
  candidate_create_opening_row: 'Crear saldo de apertura',
  already_canonical: 'Ya canónico',
  zero_no_opening_balance: 'Saldo cero · sin fila',
  review_identity_conflict: 'Identidad duplicada',
  review_missing_motil_product: 'Producto no existe en MOTIL',
  review_negative_source: 'Saldo negativo Laudus',
  review_stale_source: 'Corte desactualizado',
  review_source_authority: 'Fuente en revisión',
  review_fractional_precision: 'Cantidad decimal',
  review_existing_central_balance: 'Saldo Central existente',
  review_duplicate_unassigned_rows: 'Filas MOTIL duplicadas',
  review_unassigned_balance_or_history: 'Saldo o movimientos previos',
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo preparar la vista previa.');
  return payload as Payload;
};

const fmt = (value: number | null | undefined) => Number(value || 0).toLocaleString('es-CL', { maximumFractionDigits: 2 });
const timeLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Sin evidencia';

export function CentralStockCanonicalizationPreview() {
  const [state, setState] = useState('all');
  const [offset, setOffset] = useState(0);
  const url = `/api/bodega/central-canonicalization?state=${encodeURIComponent(state)}&limit=25&offset=${offset}`;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const summary = data?.summary;
  const pageCount = data?.rows?.length || 0;
  const candidateCount = Number(summary?.existing_zero_rows_to_assign || 0) + Number(summary?.opening_rows_to_create || 0);

  function changeState(next: string) {
    setState(next);
    setOffset(0);
  }

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Canonización · Laudus Bodega Central (002)</h2>
            <Badge variant="outline">Vista previa</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Valida qué saldos podrían convertirse en saldo de apertura de MOTIL, conservando las excepciones para revisión.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-6">
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(summary?.products_reviewed)}</p><p className="text-xs text-muted-foreground">Productos revisados</p></div>
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(candidateCount)}</p><p className="text-xs text-muted-foreground">Candidatos de apertura</p></div>
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(summary?.already_canonical)}</p><p className="text-xs text-muted-foreground">Ya canónicos en Central</p></div>
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(summary?.requires_review)}</p><p className="text-xs text-muted-foreground">Requieren revisión</p></div>
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(summary?.missing_motil_products)}</p><p className="text-xs text-muted-foreground">Sin ficha en catálogo MOTIL</p></div>
        <div className="bg-card p-4"><p className="text-2xl font-semibold">{isLoading ? '—' : fmt(summary?.zero_without_opening_balance)}</p><p className="text-xs text-muted-foreground">Saldo cero · sin fila</p></div>
      </div>

      <div className="flex flex-col gap-2 border-b bg-muted/20 px-4 py-3 text-xs sm:flex-row sm:items-center sm:justify-between">
        <p className="text-muted-foreground">Corte Laudus: {timeLabel(summary?.source_cutoff)} · Sincronización: {timeLabel(summary?.source_synced_at)} · Autoridad: {summary?.authority_state || 'Sin confirmar'}</p>
        <p className="font-medium text-muted-foreground">Solo lectura · no escribe ni reemplaza stock</p>
      </div>

      <div className="space-y-3 p-4">
        {error ? <p className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h3 className="text-sm font-medium">Detalle por producto</h3>
          <Select value={state} onValueChange={changeState}>
            <SelectTrigger className="w-full sm:w-72"><SelectValue placeholder="Filtrar estado" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos los estados</SelectItem>
              <SelectItem value="candidate_assign_zero_row">Asignar fila MOTIL vacía</SelectItem>
              <SelectItem value="candidate_create_opening_row">Crear saldo de apertura</SelectItem>
              <SelectItem value="already_canonical">Ya canónico</SelectItem>
              <SelectItem value="review_identity_conflict">Identidad duplicada</SelectItem>
              <SelectItem value="review_missing_motil_product">Producto no existe en MOTIL</SelectItem>
              <SelectItem value="review_negative_source">Saldo negativo Laudus</SelectItem>
              <SelectItem value="review_fractional_precision">Cantidad decimal</SelectItem>
              <SelectItem value="review_stale_source">Corte desactualizado</SelectItem>
              <SelectItem value="review_unassigned_balance_or_history">Saldo o movimientos previos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {isLoading ? <p className="py-5 text-center text-sm text-muted-foreground">Calculando elegibilidad desde Central…</p> : null}
        {!isLoading && !error && pageCount === 0 ? <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">No hay productos para este filtro.</p> : null}
        {!isLoading && pageCount > 0 ? <div className="overflow-x-auto rounded-md border">
          <div className="grid min-w-[720px] grid-cols-[130px_1fr_150px_200px] gap-3 border-b bg-muted/40 px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span>SKU</span><span>Producto</span><span>Laudus Central</span><span>Estado de canonización</span>
          </div>
          {data?.rows.map((row) => <div key={row.canonical_product_id} className="grid min-w-[720px] grid-cols-[130px_1fr_150px_200px] gap-3 border-b px-3 py-3 text-sm last:border-0">
            <span className="font-mono text-xs">{row.sku}</span>
            <div className="min-w-0"><p className="truncate font-medium">{row.description || 'Sin descripción'}</p><p className="text-xs text-muted-foreground">{row.source_position_count} posición(es){row.has_negative_position ? ' · contiene negativo' : ''}{row.has_fractional_position ? ' · decimal' : ''}</p></div>
            <span className="tabular-nums">{fmt(row.source_quantity)} {row.unit_of_measure || ''}</span>
            <Badge variant={row.canonicalization_state.startsWith('review_') ? 'outline' : row.canonicalization_state.startsWith('candidate_') ? 'secondary' : 'outline'} className="w-fit">{labels[row.canonicalization_state] || row.canonicalization_state}</Badge>
          </div>)}
        </div> : null}

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">{data ? `${fmt(data.count)} filas · ${fmt(data.offset + 1)}–${fmt(data.offset + pageCount)}` : '—'}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={isLoading || offset <= 0} onClick={() => setOffset(Math.max(0, offset - 25))}><ArrowLeft className="mr-1 h-4 w-4" />Anterior</Button>
            <Button variant="outline" size="sm" disabled={isLoading || !data || offset + pageCount >= data.count} onClick={() => setOffset(offset + 25)}>Siguiente<ArrowRight className="ml-1 h-4 w-4" /></Button>
          </div>
        </div>
      </div>
    </section>
  );
}
