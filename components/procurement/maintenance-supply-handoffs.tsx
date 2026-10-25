'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { useState } from 'react';
import { ArrowRight, PackageSearch, ShoppingCart } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type SupplyNeed = {
  supply_need_id: string;
  work_order_id: string | null;
  work_order_number: string | null;
  title: string | null;
  asset_code: string | null;
  asset_name: string | null;
  supply_status: string | null;
  priority: string | null;
  required_date: string | null;
  procurement_request_id: string | null;
  required_lines: number | null;
  shortage_lines: number | null;
  total_shortage_units: number | string | null;
};

type SupplyNeedsResponse = {
  needs: SupplyNeed[];
  error?: string;
};

const fetcher = async (url: string): Promise<SupplyNeedsResponse> => {
  const response = await apiFetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar las necesidades de Mantención.');
  return payload as SupplyNeedsResponse;
};

function ageText(requiredDate: string | null) {
  if (!requiredDate) return 'Sin fecha requerida';
  const required = new Date(requiredDate + 'T12:00:00');
  if (!Number.isFinite(required.getTime())) return 'Fecha no disponible';
  const days = Math.floor((Date.now() - required.getTime()) / 86400000);
  if (days > 0) return `Requerida hace ${days} día${days === 1 ? '' : 's'}`;
  if (days === 0) return 'Requerida hoy';
  return `Requerida en ${Math.abs(days)} día${Math.abs(days) === 1 ? '' : 's'}`;
}

export function MaintenanceSupplyHandoffs() {
  const { data, error, isLoading, mutate } = useSWR<SupplyNeedsResponse>('/api/procurement/supply-needs', fetcher, {
    revalidateOnFocus: false,
  });
  const needs = (data?.needs || []).filter((need) => !need.procurement_request_id);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  if (!isLoading && !error && needs.length === 0) return null;

  async function takeNeed(need: SupplyNeed) {
    setBusyId(need.supply_need_id);
    setActionError(null);
    try {
      const response = await apiFetch('/api/procurement/supply-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplyNeedId: need.supply_need_id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo tomar la necesidad.');
      await mutate();
    } catch (takeError) {
      setActionError(takeError instanceof Error ? takeError.message : 'No se pudo tomar la necesidad.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader className="flex-row items-start justify-between gap-4 space-y-0">
        <div>
          <CardTitle className="text-base">Necesidades desde Mantención</CardTitle>
          <p className="mt-1 text-sm text-muted-foreground">
            Faltantes reales detectados en una OT que todavía no tienen solicitud operativa de Compras.
          </p>
        </div>
        <Badge variant={needs.length ? 'destructive' : 'secondary'}>{isLoading ? '—' : needs.length}</Badge>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
        {actionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}

        <div className="divide-y rounded-lg border">
          {needs.map((need) => (
            <div key={need.supply_need_id} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_170px_170px_auto] lg:items-center">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <PackageSearch className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <p className="truncate font-medium">{need.work_order_number || 'OT'} · {need.asset_code || need.asset_name || 'Activo'}</p>
                </div>
                <p className="mt-1 truncate text-xs text-muted-foreground">{need.title || 'Sin título'}</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Faltante</p>
                <p className="text-sm font-medium">{Number(need.shortage_lines || 0)} línea(s) · {Number(need.total_shortage_units || 0).toLocaleString('es-CL')} un.</p>
              </div>

              <div>
                <p className="text-xs text-muted-foreground">Necesidad</p>
                <p className="text-sm font-medium">{ageText(need.required_date)}</p>
                <p className="text-xs text-muted-foreground">Prioridad {need.priority || 'sin dato'}</p>
              </div>

              <div className="flex flex-wrap justify-end gap-2">
                {need.work_order_id ? (
                  <Button asChild size="sm" variant="outline">
                    <Link href={`/dashboard/mantenimiento/ordenes-trabajo/${need.work_order_id}`}>
                      Ver OT <ArrowRight className="ml-2 h-4 w-4" />
                    </Link>
                  </Button>
                ) : null}
                <Button size="sm" onClick={() => void takeNeed(need)} disabled={busyId === need.supply_need_id}>
                  <ShoppingCart className="mr-2 h-4 w-4" />
                  {busyId === need.supply_need_id ? 'Tomando…' : 'Tomar necesidad'}
                </Button>
              </div>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground">
          Esta acción crea la solicitud operativa para Compras. No adjudica proveedor, no emite OC y no compra automáticamente.
        </p>
      </CardContent>
    </Card>
  );
}
