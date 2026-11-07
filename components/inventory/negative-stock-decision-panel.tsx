'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useModuleAccess } from '@/hooks/use-module-access';

type Decision = { sku: string; description: string; unit?: string | null; laudusStock: number; motilStock?: number | null; exposureClp?: number | null; weightedUnitCostClp?: number | null; purchaseOrderCount: number; review?: { decision?: string | null; stale?: boolean } | null };
type Response = { decisions: Decision[]; summary: { actionable: number; reviewed: number; exposureClp: number; top3ExposureClp: number }; semantics: string };

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la prioridad de Bodega.');
  return payload;
};
const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-CL').format(value) : '—';
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value) : '—';

export function NegativeStockDecisionPanel() {
  const { canEdit, ready } = useModuleAccess();
  const { data, error, isLoading, mutate } = useSWR<Response>('/api/inventory/negative-stock-decisions', fetcher, { revalidateOnFocus: false });
  const [savingSku, setSavingSku] = useState<string | null>(null);
  const decisions = data?.decisions || [];

  const decide = async (sku: string, decision: string) => {
    setSavingSku(sku);
    try {
      const response = await fetch('/api/inventory/negative-stock-decisions', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sku, decision }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la decisión.');
      await mutate();
    } finally {
      setSavingSku(null);
    }
  };

  return <section className="space-y-4">
    <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Excepciones activas</p><p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : number(data?.summary.actionable)}</p><p className="mt-1 text-xs text-muted-foreground">Laudus con saldo bajo cero</p></div>
      <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Exposición estimada</p><p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : money(data?.summary.exposureClp)}</p><p className="mt-1 text-xs text-muted-foreground">Costo histórico promedio · no es pérdida</p></div>
      <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Top 3</p><p className="mt-2 text-2xl font-semibold tabular-nums">{isLoading ? '—' : money(data?.summary.top3ExposureClp)}</p><p className="mt-1 text-xs text-muted-foreground">Concentración para revisar primero</p></div>
    </div>

    <div className="rounded-lg border bg-card">
      <div className="border-b p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prioridad por impacto</p><h2 className="mt-1 text-lg font-semibold">Decidir antes de ajustar</h2><p className="mt-1 text-sm text-muted-foreground">MOTIL prioriza por exposición estimada y conserva la decisión humana. Ninguna acción modifica stock ni escribe en Laudus.</p></div>
      {error ? <div className="p-4 text-sm text-destructive">{error.message}</div> : null}
      {!isLoading && decisions.length === 0 ? <div className="p-6 text-sm text-muted-foreground">No hay excepciones negativas activas en Laudus.</div> : null}
      <div className="divide-y">{decisions.map((item, index) => {
        const reviewed = Boolean(item.review && !item.review.stale);
        const disabled = savingSku === item.sku || !ready || !canEdit('bodega_inventario');
        return <div key={item.sku} className="grid gap-4 p-4 xl:grid-cols-[minmax(0,1fr)_190px_340px] xl:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2"><Badge variant={index < 3 ? 'destructive' : 'outline'}>#{index + 1}</Badge><span className="font-mono text-xs text-muted-foreground">{item.sku}</span>{reviewed ? <Badge variant="outline">Decisión registrada</Badge> : null}{item.review?.stale ? <Badge variant="secondary">Nueva evidencia</Badge> : null}</div>
            <p className="mt-2 font-medium">{item.description}</p>
            <p className="mt-1 text-sm text-muted-foreground">Laudus: {number(item.laudusStock)} {item.unit || 'unidad'}{item.motilStock != null ? ' · MOTIL: ' + number(item.motilStock) : ' · Sin saldo MOTIL comparable'}.</p>
            <p className="mt-2 text-xs text-muted-foreground">{item.purchaseOrderCount ? number(item.purchaseOrderCount) + ' OC históricas' : 'Sin OC histórica comparable'}{item.weightedUnitCostClp != null ? ' · costo promedio ' + money(item.weightedUnitCostClp) : ''}</p>
          </div>
          <div><p className="text-xs text-muted-foreground">Exposición estimada</p><p className="mt-1 text-xl font-semibold tabular-nums">{item.exposureClp == null ? 'Sin costo comparable' : money(item.exposureClp)}</p>{reviewed ? <p className="mt-2 text-xs text-muted-foreground">Última decisión: {item.review?.decision || 'revisada'}</p> : null}</div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => void decide(item.sku, 'saldo_correcto')}>Saldo correcto</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => void decide(item.sku, 'falta_movimiento')}>Falta registrar movimiento</Button>
            <Button size="sm" variant={index < 3 ? 'default' : 'outline'} disabled={disabled} onClick={() => void decide(item.sku, 'ajuste_laudus')}>Requiere ajuste Laudus</Button>
            <Button size="sm" variant="outline" disabled={disabled} onClick={() => void decide(item.sku, 'reponer')}>Reponer</Button>
            <Button size="sm" variant="ghost" disabled={disabled} onClick={() => void decide(item.sku, 'no_aplica')}>No aplica</Button>
          </div>
        </div>;
      })}</div>
      {data?.semantics ? <div className="border-t bg-muted/20 px-4 py-3 text-xs text-muted-foreground">{data.semantics}</div> : null}
    </div>
  </section>;
}