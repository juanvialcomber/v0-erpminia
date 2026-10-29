'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Need = {
  supply_need_id: string;
  work_order_id?: string | null;
  work_order_number?: string | null;
  title?: string | null;
  asset_code?: string | null;
  priority?: string | null;
  required_date?: string | null;
  shortage_lines: number;
  total_shortage_units: number;
  current_stock_review?: { source: string; covered_lines: number; shortage_lines: number; all_covered_now: boolean; latest_laudus_stock_sync?: string | null; authority_reason?: string | null };
  no_purchase_decision?: { created_at?: string | null; user_id?: string | null; new_values?: { decision?: string | null } | null } | null;
};
type Response = { needs: Need[] };

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las necesidades de abastecimiento.');
  return payload as Response;
};

export function PendingMaintenanceSupplyNeeds() {
  const { data, error, isLoading, mutate } = useSWR<Response>('/api/procurement/supply-needs', fetcher, { revalidateOnFocus: false });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const needs = data?.needs || [];

  const postDecision = async (need: Need, action: 'send_to_procurement' | 'confirm_no_purchase') => {
    setBusyId(need.supply_need_id); setActionError(null);
    try {
      const response = await fetch('/api/procurement/supply-needs', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplyNeedId: need.supply_need_id, action }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la decisión.');
      await mutate();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'No se pudo registrar la decisión.');
      await mutate();
    } finally { setBusyId(null); }
  };

  if (!isLoading && !error && needs.length === 0) return null;

  return <section className="space-y-3" aria-labelledby="maintenance-supply-needs">
    <div><h2 id="maintenance-supply-needs" className="text-lg font-semibold tracking-tight">Necesidades desde Mantención</h2><p className="text-sm text-muted-foreground">MOTIL vuelve a validar stock actual antes de crear una solicitud de compra.</p></div>
    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
    {actionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}
    <div className="divide-y rounded-lg border bg-card">
      {isLoading ? <div className="h-24 animate-pulse bg-muted/40" /> : null}
      {needs.map((need) => {
        const covered = need.current_stock_review?.all_covered_now === true;
        const noPurchaseReviewed = Boolean(need.no_purchase_decision);
        return <div key={need.supply_need_id} className="grid gap-4 p-4 lg:grid-cols-[minmax(0,1fr)_220px_auto] lg:items-center">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              {covered ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : <AlertTriangle className="h-4 w-4 text-muted-foreground" />}
              <p className="font-medium">{need.work_order_number || 'OT'} · {need.title || 'Necesidad de abastecimiento'}</p>
              <Badge variant={covered ? 'secondary' : 'destructive'}>{covered ? 'Stock disponible hoy' : 'Faltante vigente por revisar'}</Badge>{noPurchaseReviewed ? <Badge variant="outline">No comprar · decisión registrada</Badge> : null}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{need.asset_code || 'Sin activo'} · {need.shortage_lines} línea(s) · {need.total_shortage_units} unidad(es) registradas como faltantes.</p>
          </div>
          <div>
            <p className="text-xs text-muted-foreground">Revalidación</p>
            <p className="mt-1 text-sm font-medium">{need.current_stock_review ? `${need.current_stock_review.covered_lines}/${need.current_stock_review.shortage_lines} líneas cubiertas` : 'Sin evidencia actual'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{need.current_stock_review?.source === 'laudus_primary' ? 'Laudus es fuente primaria actual.' : 'Requiere revisión de fuente.'}</p>
          </div>
          <div className="flex flex-wrap justify-end gap-2">
            {need.work_order_id ? <Button asChild size="sm" variant="outline"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${need.work_order_id}`}>Ver OT <ArrowRight className="ml-2 h-4 w-4" /></Link></Button> : null}
            {covered ? <Button size="sm" variant="secondary" disabled={busyId === need.supply_need_id || noPurchaseReviewed} onClick={() => void postDecision(need, 'confirm_no_purchase')}>{noPurchaseReviewed ? 'No comprar registrado' : busyId === need.supply_need_id ? 'Registrando…' : 'Registrar no comprar'}</Button> : <Button size="sm" disabled={busyId === need.supply_need_id} onClick={() => void postDecision(need, 'send_to_procurement')}>{busyId === need.supply_need_id ? 'Validando…' : 'Enviar a Compras'}</Button>}
          </div>
        </div>;
      })}
    </div>
  </section>;
}