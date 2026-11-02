'use client';

import { useMemo, useState } from 'react';
import useSWRMutation from 'swr/mutation';
import { History } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type LaudusLink = {
  external_id: string;
  laudus_product_id: number | string;
  sku: string | null;
  description: string | null;
  unit_of_measure: string | null;
  reconciliation_status: string | null;
  synced_at: string | null;
};

type KardexRow = {
  date?: string | null;
  description?: string | null;
  quantity?: number | null;
  unitCost?: number | null;
  cost?: number | null;
  stock?: number | null;
  inventoryDifference?: number | null;
  totalUnitCost?: number | null;
  totalCost?: number | null;
  lot?: string | null;
  warehouseId?: string | null;
  unitPrice?: number | null;
  margin?: number | null;
  marginPercentage?: number | null;
  movementType?: string | null;
  movementId?: number | string | null;
};

type Response = {
  generatedAt: string;
  productId: string;
  warehouseId: string | null;
  dateTo: string | null;
  movements: number;
  persisted: true;
  stagingOnly: true;
  canonicalMutated: false;
  laudusMutated: false;
  result: Record<string, unknown>;
  rows?: KardexRow[];
};

async function trigger(url: string, { arg }: { arg: { productId: string; warehouseId?: string | null } }): Promise<Response> {
  const response = await fetch(url, {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(arg),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el Kardex Laudus');
  return payload as Response;
}

const number = (value: unknown) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value || 0));
const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(String(value))) : 'Sin fecha';

export function LaudusProductKardexCard({
  laudusLink,
  warehouseId,
}: {
  laudusLink: LaudusLink | null;
  warehouseId?: string | null;
}) {
  const { trigger: run, data, error, isMutating } = useSWRMutation<Response, Error, string, { productId: string; warehouseId?: string | null }>(
    '/api/integrations/laudus/kardex-sync',
    trigger,
  );
  const [queried, setQueried] = useState(false);

  const rows = useMemo(() => {
    const raw = Array.isArray((data as any)?.rows) ? (data as any).rows as KardexRow[] : [];
    return raw.slice(-50).reverse();
  }, [data]);

  if (!laudusLink) {
    return (
      <Card className="shadow-none">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Kardex Laudus</CardTitle>
          <CardDescription>Este producto todavía no tiene un vínculo Laudus validado.</CardDescription>
        </CardHeader>
        <CardContent>
          <Badge variant="outline">Sin vínculo</Badge>
        </CardContent>
      </Card>
    );
  }

  const execute = async () => {
    setQueried(true);
    await run({
      productId: String(laudusLink.laudus_product_id || laudusLink.external_id),
      warehouseId: warehouseId || null,
    });
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LaudusSourceMark state={isMutating ? 'syncing' : error ? 'review' : data ? 'connected' : 'pending'} compact />
              <CardTitle className="flex items-center gap-2"><History className="h-4 w-4" />Kardex Laudus</CardTitle>
            </div>
            <CardDescription>
              Movimiento ERP del producto vinculado. Consulta bajo demanda; no reemplaza el Kardex operativo MOTIL.
            </CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => void execute()} disabled={isMutating}>
            {isMutating ? 'Consultando…' : queried ? 'Actualizar Kardex' : 'Consultar Kardex'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span>SKU Laudus: {laudusLink.sku || laudusLink.external_id}</span>
          {warehouseId ? <span>· Bodega {warehouseId}</span> : null}
          {laudusLink.synced_at ? <span>· vínculo {date(laudusLink.synced_at)}</span> : null}
        </div>

        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {!queried ? <p className="text-sm text-muted-foreground">No consume API hasta que se solicita el historial.</p> : null}

        {data ? (
          <>
            <div className="flex flex-wrap gap-2">
              <Badge variant="secondary">{data.movements.toLocaleString('es-CL')} movimientos</Badge>
              <Badge variant="outline">Staging MOTIL</Badge>
              <Badge variant="outline">Laudus sin cambios</Badge>
            </div>
            {rows.length ? (
              <div className="divide-y overflow-hidden rounded-lg border">
                {rows.map((row, index) => (
                  <div key={String(row.movementId || `${row.date || 'movement'}-${index}`)} className="grid gap-2 p-3 sm:grid-cols-[110px_minmax(0,1fr)_100px_120px] sm:items-center">
                    <p className="text-xs text-muted-foreground">{date(row.date)}</p>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{row.description || row.movementType || 'Movimiento Laudus'}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{row.warehouseId || 'Sin bodega'}{row.lot ? ` · lote ${row.lot}` : ''}</p>
                    </div>
                    <p className="text-sm tabular-nums sm:text-right">{number(row.quantity)}</p>
                    <p className="text-sm font-medium tabular-nums sm:text-right">{row.unitCost == null ? '—' : money(row.unitCost)}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="rounded-lg border p-4 text-sm text-muted-foreground">Kardex consultado. La vista detallada se alimentará desde staging cuando existan movimientos retornados.</p>
            )}
            <p className="text-xs text-muted-foreground">El stock ERP y el stock operativo MOTIL siguen siendo fuentes distintas hasta conciliación explícita.</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
