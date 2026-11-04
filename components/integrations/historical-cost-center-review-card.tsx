'use client';

import useSWR from 'swr';
import { AlertTriangle, Layers3 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

type Row = {
  purchase_order_id: string;
  order_number: string | null;
  order_date: string | null;
  supplier_name: string | null;
  cost_center_resolution_status: 'unknown_code' | 'multi_line_review' | 'unresolved';
  raw_line_cost_center: string | null;
  parsed_line_cost_center_code: string | null;
  distinct_line_cost_centers: number | null;
  total_amount: number | null;
  currency: string | null;
};

type Payload = {
  summary: {
    unknownCode: number;
    multiLineReview: number;
    unresolved: number;
    actionable: number;
  };
  rows: Row[];
  readOnly: true;
  policy: 'review_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la revisión de centros de costo.');
  return payload;
};

const label = (status: Row['cost_center_resolution_status']) => {
  if (status === 'unknown_code') return 'Código no reconocido';
  if (status === 'multi_line_review') return 'Revisar líneas';
  return 'Sin centro informado';
};

export function HistoricalCostCenterReviewCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/procurement/cost-center-review',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-start justify-between gap-4 border-b px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Layers3 className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Centros de costo históricos</h2>
          </div>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Sólo OC históricas que aún requieren evidencia. Las asignaciones multi-centro válidas no se consideran conflicto.
          </p>
        </div>
        <p className="text-2xl font-semibold">{isLoading || !data ? '—' : data.summary.actionable.toLocaleString('es-CL')}</p>
      </div>

      {data ? (
        <div className="grid gap-px border-b bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Código desconocido</p><p className="mt-1 text-lg font-semibold">{data.summary.unknownCode.toLocaleString('es-CL')}</p></div>
          <div className="bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Revisar líneas</p><p className="mt-1 text-lg font-semibold">{data.summary.multiLineReview.toLocaleString('es-CL')}</p></div>
          <div className="bg-card px-4 py-3"><p className="text-xs text-muted-foreground">Sin centro informado</p><p className="mt-1 text-lg font-semibold">{data.summary.unresolved.toLocaleString('es-CL')}</p></div>
        </div>
      ) : null}

      <div className="divide-y">
        {(data?.rows || []).slice(0, 8).map((row) => (
          <div key={row.purchase_order_id} className="flex items-center justify-between gap-4 px-4 py-3">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="truncate text-sm font-medium">{row.order_number || 'OC histórica'}</p>
                <Badge variant="outline">{label(row.cost_center_resolution_status)}</Badge>
              </div>
              <p className="mt-1 truncate text-xs text-muted-foreground">
                {row.supplier_name || 'Proveedor sin nombre'}{row.parsed_line_cost_center_code ? ' · ' + row.parsed_line_cost_center_code : ''}
              </p>
            </div>
            {row.cost_center_resolution_status === 'multi_line_review' ? <AlertTriangle className="h-4 w-4 shrink-0 text-muted-foreground" /> : null}
          </div>
        ))}
      </div>

      <div className="border-t px-4 py-3 text-xs text-muted-foreground">
        Cola de revisión en sólo lectura. MOTIL no reasigna OC históricas desde esta vista.
      </div>
    </section>
  );
}
