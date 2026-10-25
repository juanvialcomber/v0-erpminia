'use client';

import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('No se pudo cargar el historial de compras y gastos. Inténtalo de nuevo.');
  return payload;
};

const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(String(value))) : 'Sin fecha';

type LedgerEvent = {
  event_id: string;
  event_at: string | null;
  recognition_status: string;
  source_table: string;
  source_record_id: string;
  amount?: number | string | null;
  description?: string | null;
};

const sourceLabels: Record<string, string> = {
  'canonical.asset_costs': 'Costo asociado a un equipo',
  'canonical.purchase_order_lines': 'Orden de compra',
  'public.work_order_parts': 'Materiales de una orden de trabajo',
  'public.work_order_labor_entries': 'Mano de obra de una orden de trabajo',
  'public.maintenance_work_orders': 'Orden de trabajo',
  'public.procurement_operational_order_lines': 'Orden de compra',
  'public.procurement_operational_receipt_lines': 'Recepción de compra',
};

function sourceLabel(sourceTable: string) {
  return sourceLabels[sourceTable] || 'Registro de compra o gasto';
}

function statusLabel(status: string) {
  if (status === 'recognized') return 'Gasto registrado';
  if (status === 'committed') return 'Orden de compra';
  return 'Movimiento financiero';
}

export default function FinanceTraceabilityPage() {
  const params = useSearchParams();
  const q = params.get('q') || '';
  const status = params.get('status') || 'all';
  const url = `/api/finance/event-ledger?q=${encodeURIComponent(q)}&status=${encodeURIComponent(status)}`;
  const { data, error, isLoading } = useSWR(url, fetcher);
  const events: LedgerEvent[] = data?.events || [];

  return (
    <div className="space-y-6">
      <section className="border-b pb-5">
        <p className="text-sm text-muted-foreground">Finanzas · Compras y gastos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Origen de gastos y compras</h1>
        <p className="mt-2 text-sm text-muted-foreground">Consulta la fecha, el detalle, el origen y el monto de cada movimiento. Los valores están en pesos chilenos.</p>
      </section>

      {q ? <div className="rounded-lg border p-3 text-sm">Buscando: <span className="font-medium">{q}</span></div> : null}
      {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando registros...</p> : null}
      {data?.capped ? <p className="rounded-lg border bg-muted/30 p-3 text-sm text-muted-foreground">La lista muestra los 250 movimientos más recientes.</p> : null}

      <div className="overflow-hidden rounded-lg border">
        <div className="hidden grid-cols-[110px_130px_1fr_150px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid">
          <span>Fecha</span><span>Tipo</span><span>Origen</span><span>Monto</span>
        </div>
        {!isLoading && !events.length ? <p className="p-8 text-center text-sm text-muted-foreground">No hay registros para mostrar.</p> : null}
        {events.map((event) => (
          <div key={event.event_id} className="grid gap-2 border-b px-4 py-4 last:border-0 lg:grid-cols-[110px_130px_1fr_150px] lg:items-center lg:gap-4">
            <p className="text-sm">{date(event.event_at)}</p>
            <Badge variant="outline" className="w-fit">{statusLabel(event.recognition_status)}</Badge>
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">{event.description || sourceLabel(event.source_table)}</p>
              <p className="text-xs text-muted-foreground">Origen: {sourceLabel(event.source_table)}</p>
              {event.source_record_id ? <details className="mt-1 text-xs text-muted-foreground"><summary className="w-fit cursor-pointer hover:text-foreground">Ver referencia de origen</summary><p className="mt-1 break-all font-mono">{event.source_record_id}</p></details> : null}
            </div>
            <p className="text-sm font-semibold tabular-nums lg:text-right">{money(event.amount)}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
