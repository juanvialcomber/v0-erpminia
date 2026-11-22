'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Locale } from '@/lib/i18n/dictionaries';

type Candidate = {
  workOrderId: string;
  workOrderNumber: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  scheduledDate: string | null;
};

type Payload = {
  activeOrdersTotal: number;
  activeOrdersReviewed: number;
  requirementsRegisteredOrders: number;
  withoutRegisteredRequirements: number;
  partial: boolean;
  reviewCandidates: Candidate[];
  mandatory: false;
  asOf: string;
};

async function fetcher(url: string): Promise<Payload> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo revisar las necesidades de materiales.');
  return payload as Payload;
}

export function MaintenanceMaterialsAttention({ locale }: { locale: Locale }) {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/maintenance/materials-attention',
    fetcher,
    { revalidateOnFocus: false },
  );
  const english = locale === 'en';

  return (
    <section aria-label={english ? 'Work-order materials review' : 'Revisión de materiales por OT'} className="space-y-3 rounded-lg border bg-card p-4 md:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {english ? 'Maintenance · Warehouse coordination' : 'Mantenimiento · Coordinación con Bodega'}
          </p>
          <h2 className="mt-1 text-lg font-semibold">{english ? 'Materials needed by active orders' : 'Materiales de OT activas'}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {english
              ? 'Review whether each active work order needs parts. This is optional during the warehouse transition and never prevents mechanics from closing work.'
              : 'Ariel revisa qué OT necesitan repuestos y registra cantidades cuando corresponde. Durante la transición es opcional y nunca bloquea el cierre del mecánico.'}
          </p>
        </div>
        <Button size="sm" variant="outline" onClick={() => void mutate()} disabled={isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />{english ? 'Refresh' : 'Actualizar'}
        </Button>
      </div>

      {error ? <p role="status" className="text-sm text-destructive">{error.message}</p> : null}
      <div className="grid gap-px overflow-hidden rounded-md border bg-border sm:grid-cols-3">
        {([
          [english ? 'Active work orders' : 'OT activas revisadas', data?.activeOrdersReviewed],
          [english ? 'With material requests' : 'Con materiales registrados', data?.requirementsRegisteredOrders],
          [english ? 'No request recorded' : 'Sin requerimiento registrado', data?.withoutRegisteredRequirements],
        ] as const).map(([label, value]) => (
          <div key={label} className="bg-card p-3">
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {isLoading || error || value === undefined ? '—' : value.toLocaleString('es-CL')}
            </p>
          </div>
        ))}
      </div>

      {data?.partial ? (
        <p role="status" className="text-xs text-muted-foreground">
          {english
            ? 'Partial review. The counts above cover only the first 200 active orders.'
            : 'Revisión parcial: las cifras corresponden a las primeras 200 OT activas, no a todo el universo.'}
        </p>
      ) : null}
      {!error && !isLoading && data && data.reviewCandidates.length > 0 ? (
        <div className="space-y-2">
          <p className="text-sm font-medium">
            {english ? 'First orders to review' : 'Primero, revisar si necesitan materiales'}
          </p>
          <div className="divide-y rounded-md border">
            {data.reviewCandidates.map((order) => (
              <Link
                key={order.workOrderId}
                href={'/dashboard/mantenimiento/ordenes-trabajo/' + order.workOrderId + '#materiales-ot'}
                className="flex items-center justify-between gap-3 px-3 py-3 outline-none hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{order.workOrderNumber || 'OT'} · {order.title || (english ? 'Work order' : 'Sin título')}</p>
                  <p className="text-xs text-muted-foreground">
                    {order.priority || (english ? 'Priority not set' : 'Prioridad sin definir')}
                    {order.scheduledDate ? ' · ' + order.scheduledDate.slice(0, 10) : ''}
                  </p>
                </div>
                <ArrowRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>
      ) : !error && !isLoading && data && data.activeOrdersReviewed === 0 ? (
        <p className="text-sm text-muted-foreground">{english ? 'No active work orders to review.' : 'No hay OT activas pendientes de revisión.'}</p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        {english
          ? 'No request is not a shortage. Only physically verified materials may be issued; recording a requirement does not change stock.'
          : 'Sin requerimiento no significa faltante: algunas OT no necesitan repuestos. Registrar una necesidad no genera entrega ni descuenta existencias.'}
      </p>
    </section>
  );
}
