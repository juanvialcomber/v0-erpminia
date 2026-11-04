'use client';

import Link from 'next/link';
import { useState } from 'react';
import useSWR from 'swr';
import { ArrowRight, CircleDot } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Domain = {
  key: string;
  label: string;
  state: 'operational' | 'transition' | 'review' | 'blocked' | 'discovery';
  detail: string;
  blockers: number;
  actionHref: string;
};

type Payload = {
  domains: Domain[];
  summary: {
    total: number;
    operational: number;
    transition: number;
    review: number;
    blocked: number;
    discovery: number;
  };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el mapa de reemplazo.');
  return payload;
};

const stateLabel: Record<Domain['state'], string> = {
  operational: 'MOTIL operativo',
  transition: 'En transición',
  review: 'Requiere revisión',
  blocked: 'Bloqueado',
  discovery: 'Por descubrir',
};

export default function LaudusReplacementPage() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/replacement-map',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );
  const [syncingTrace, setSyncingTrace] = useState(false);
  const [discoveringSales, setDiscoveringSales] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function discoverSales() {
    setDiscoveringSales(true);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/laudus/sales-discovery', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo revisar Clientes/Ventas.');
      setMessage(payload?.usageDetected
        ? `Clientes/Ventas sí tiene uso en Laudus: ${Number(payload.customersObserved || 0)} clientes y ${Number(payload.salesOrdersObserved || 0)} pedidos observados en la muestra.`
        : 'No se detectó uso de Clientes/Ventas en la muestra acotada.');
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo revisar Clientes/Ventas.');
    } finally {
      setDiscoveringSales(false);
    }
  }

  async function syncInvoiceTrace() {
    setSyncingTrace(true);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/laudus/native-invoice-trace/sync', {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar la trazabilidad.');
      setMessage(`Trazabilidad: ${Number(payload?.scanned || 0)} facturas escaneadas, ${Number(payload?.tracesPersisted || 0)} trazas guardadas.`);
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo actualizar la trazabilidad.');
    } finally {
      setSyncingTrace(false);
    }
  }

  return (
    <div className="space-y-6">
      <section className="border-b pb-6">
        <p className="text-sm font-medium text-muted-foreground">Datos · reemplazo ERP</p>
        <h1 className="mt-1 text-3xl font-semibold tracking-tight">Reemplazo Laudus</h1>
        <p className="mt-2 max-w-3xl text-sm text-muted-foreground">
          Objetivo: cero dependencia operacional diaria. Cada dominio debe pasar de fuente Laudus a evidencia, acción y autoridad MOTIL sin copiar inconsistencias.
        </p>
      </section>

      {message ? <div className="rounded-lg border p-4 text-sm text-muted-foreground">{message}</div> : null}

      {error ? (
        <div className="rounded-lg border p-5 text-sm text-muted-foreground">No se pudo calcular el mapa de reemplazo.</div>
      ) : (
        <>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-5">
            <Metric label="Operativos" value={isLoading || !data ? '—' : data.summary.operational} />
            <Metric label="Transición" value={isLoading || !data ? '—' : data.summary.transition} />
            <Metric label="Revisión" value={isLoading || !data ? '—' : data.summary.review} />
            <Metric label="Bloqueados" value={isLoading || !data ? '—' : data.summary.blocked} />
            <Metric label="Discovery" value={isLoading || !data ? '—' : data.summary.discovery} />
          </div>

          <section className="overflow-hidden rounded-lg border">
            <div className="border-b px-4 py-3">
              <h2 className="text-base font-semibold">Dominios</h2>
            </div>
            <div className="divide-y">
              {(data?.domains || []).map((domain) => (
                <div key={domain.key} className="grid gap-3 p-4 lg:grid-cols-[180px_150px_1fr_120px] lg:items-center">
                  <div className="flex items-center gap-2">
                    <CircleDot className="h-4 w-4 text-muted-foreground" />
                    <p className="font-medium">{domain.label}</p>
                  </div>
                  <Badge variant={domain.state === 'blocked' ? 'destructive' : domain.state === 'operational' ? 'secondary' : 'outline'}>
                    {stateLabel[domain.state]}
                  </Badge>
                  <div>
                    <p className="text-sm text-muted-foreground">{domain.detail}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Pendientes detectados: {Number(domain.blockers || 0).toLocaleString('es-CL')}
                    </p>
                  </div>
                  <div className="flex items-center justify-end gap-2">
                    {domain.key === 'invoices' ? (
                      <Button size="sm" variant="outline" disabled={syncingTrace} onClick={() => void syncInvoiceTrace()}>
                        {syncingTrace ? 'Escaneando…' : 'Escanear 5'}
                      </Button>
                    ) : null}
                    {domain.key === 'sales' ? (
                      <Button size="sm" variant="outline" disabled={discoveringSales} onClick={() => void discoverSales()}>
                        {discoveringSales ? 'Revisando…' : 'Descubrir'}
                      </Button>
                    ) : null}
                    <Link href={domain.actionHref} className="inline-flex items-center gap-2 text-sm font-medium hover:underline">
                      Resolver <ArrowRight className="h-4 w-4" />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="bg-card p-4">
      <p className="text-2xl font-semibold">{value}</p>
      <p className="mt-1 text-xs text-muted-foreground">{label}</p>
    </div>
  );
}
