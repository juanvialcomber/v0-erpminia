'use client';

import useSWR from 'swr';
import { CheckCircle2, Database, Link2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

type Row = {
  key: string;
  label: string;
  total: number;
  identityReady: number;
  identityCoverage: number;
  linkedToLaudus: number;
  linkCoverage: number;
  gaps: string[];
};

type Payload = {
  source: { configured: boolean; enabled: boolean };
  summary: {
    total: number;
    identityReady: number;
    identityCoverage: number;
    linked: number;
    linkCoverage: number;
  };
  rows: Row[];
  generatedAt: string;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular la preparación.');
  return payload;
};

function pct(value: number) {
  return `${value.toLocaleString('es-CL', { maximumFractionDigits: 1 })}%`;
}

export function LaudusMasterReadinessCard() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/master-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (error?.message?.includes('permisos de administración')) return null;

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Preparación para migración Laudus</h2>
            <Badge variant={data?.source.enabled ? 'secondary' : 'outline'}>
              {data?.source.enabled ? 'Conector habilitado' : 'Preparación'}
            </Badge>
          </div>
          <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
            Mide si los maestros de MOTIL tienen identidad suficiente para reconciliarse con Laudus cuando la API quede disponible.
          </p>
        </div>
        <Button variant="ghost" size="sm" onClick={() => void mutate()} disabled={isLoading}>
          <RefreshCw className={`mr-2 h-3.5 w-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Actualizar
        </Button>
      </div>

      <div className="grid gap-px bg-border sm:grid-cols-3">
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : data.summary.total.toLocaleString('es-CL')}</p>
          <p className="mt-1 text-xs text-muted-foreground">Maestros evaluados</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.summary.identityCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Identidad preparada</p>
        </div>
        <div className="bg-card p-4">
          <p className="text-2xl font-semibold">{isLoading || !data ? '—' : pct(data.summary.linkCoverage)}</p>
          <p className="mt-1 text-xs text-muted-foreground">Enlazado a Laudus</p>
        </div>
      </div>

      <div className="divide-y border-t">
        {(data?.rows || []).map((row) => (
          <div key={row.key} className="grid gap-3 px-4 py-4 md:grid-cols-[minmax(0,1fr)_170px_170px] md:items-center">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium">{row.label}</p>
                {row.identityCoverage === 100 ? <CheckCircle2 className="h-4 w-4 text-muted-foreground" /> : null}
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {row.total.toLocaleString('es-CL')} registro{row.total === 1 ? '' : 's'}
                {row.gaps.length ? ` · ${row.gaps.join(' · ')}` : ''}
              </p>
            </div>
            <div>
              <p className="text-sm font-semibold">{pct(row.identityCoverage)}</p>
              <p className="text-xs text-muted-foreground">Identidad preparada</p>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <Link2 className="h-3.5 w-3.5 text-muted-foreground" />
                <p className="text-sm font-semibold">{row.linkedToLaudus.toLocaleString('es-CL')} · {pct(row.linkCoverage)}</p>
              </div>
              <p className="text-xs text-muted-foreground">Vínculos Laudus</p>
            </div>
          </div>
        ))}

        {!isLoading && !error && data?.rows.length === 0 ? (
          <div className="p-5 text-sm text-muted-foreground">No hay maestros disponibles para evaluar.</div>
        ) : null}

        {error && !error.message?.includes('permisos de administración') ? (
          <div className="p-5 text-sm text-muted-foreground">No se pudo calcular la preparación para Laudus.</div>
        ) : null}
      </div>
    </section>
  );
}
