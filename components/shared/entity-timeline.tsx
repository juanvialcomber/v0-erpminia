'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

type Entity = 'asset' | 'product' | 'supplier' | 'work_order';

type TimelineEvent = {
  event_id: string;
  event_at?: string | null;
  origin: 'CANONICAL' | 'ERP';
  event_type: string;
  source_table: string;
  source_record_id: string;
  amount?: number | string | null;
  currency?: string | null;
  description?: string | null;
};

type Response = { events?: TimelineEvent[] };

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el historial');
  return payload;
};

const date = (value?: string | null) =>
  value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';

const money = (value: unknown, currency = 'CLP') =>
  new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: 0 }).format(Number(value || 0));

const eventLabels: Record<string, string> = {
  actual_cost: 'Costo reconocido',
  purchase_commitment: 'Compromiso de compra',
  purchase_order: 'Orden de compra',
  purchase_order_issued: 'OC emitida',
  product_ordered: 'Producto ordenado',
  goods_received: 'Recepción',
  receipt: 'Recepción',
  issue: 'Entrega a OT',
  installation: 'Instalación',
  return: 'Devolución',
  completed: 'Cierre',
  emergency_detected: 'Emergencia detectada',
  timer_play: 'Trabajo iniciado',
  work_order_closed: 'Trabajo cerrado',
};

export function EntityTimeline({ entity, id, limit = 20 }: { entity: Entity; id: string; limit?: number }) {
  const { data, error, isLoading } = useSWR<Response>(
    id ? `/api/timeline/${entity}/${encodeURIComponent(id)}?limit=${limit}` : null,
    fetcher,
    { revalidateOnFocus: false },
  );

  const events = data?.events || [];

  return (
    <Card className="shadow-none">
      <CardHeader className="pb-3">
        <CardTitle className="text-base">Historial</CardTitle>
        <p className="text-sm text-muted-foreground">Eventos canónicos y operativos ordenados por fecha, sin duplicar la fuente.</p>
      </CardHeader>
      <CardContent>
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando historial...</p> : null}
        {error ? <p className="text-sm text-destructive">No fue posible cargar el historial.</p> : null}
        {!isLoading && !error && !events.length ? (
          <p className="rounded-md border border-dashed p-5 text-center text-sm text-muted-foreground">Sin eventos vinculados.</p>
        ) : null}
        <div className="divide-y">
          {events.map((event) => (
            <div key={event.event_id} className="grid gap-2 py-3 md:grid-cols-[110px_110px_1fr_150px] md:items-center">
              <p className="text-sm text-muted-foreground">{date(event.event_at)}</p>
              <Badge variant={event.origin === 'CANONICAL' ? 'secondary' : 'outline'} className="w-fit">
                {event.origin === 'CANONICAL' ? 'Canónico' : 'ERP'}
              </Badge>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{event.description || eventLabels[event.event_type] || event.event_type}</p>
                <p className="truncate text-xs text-muted-foreground">{event.source_table} · {event.source_record_id}</p>
              </div>
              <p className="text-sm font-semibold tabular-nums md:text-right">
                {event.amount !== null && event.amount !== undefined ? money(event.amount, event.currency || 'CLP') : '—'}
              </p>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
