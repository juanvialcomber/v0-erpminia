'use client';

import useSWR from 'swr';
import { Landmark } from 'lucide-react';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type FinanceControl = {
  accountsPayable?: { latestSync?: string | null };
  payments?: { latestSync?: string | null };
  costCenters?: { total?: number; unresolved?: number; latestSync?: string | null };
  fixedAssets?: { total?: number; linkedToMotil?: number };
  freshness?: { latestOperationalSync?: string | null; operationalSyncAgeDays?: number | null };
};

const fetcher = async (url: string): Promise<FinanceControl> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Laudus.');
  return payload as FinanceControl;
};

function freshness(value?: string | null) {
  if (!value) return 'Sin sincronización';
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Fecha por revisar';
  return new Intl.DateTimeFormat('es-CL', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Santiago',
  }).format(date);
}

export function LaudusFinanceStatusStrip({ compact = false }: { compact?: boolean }) {
  const { data, error, isLoading } = useSWR<FinanceControl>(
    '/api/integrations/laudus/finance-control',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 15 * 60 * 1000 },
  );

  const ageDays = data?.freshness?.operationalSyncAgeDays;
  const stale = ageDays != null && ageDays > 0;
  const state = error ? 'offline' : isLoading ? 'syncing' : stale ? 'review' : 'connected';
  const domains = [
    data?.accountsPayable?.latestSync ? 'CxP' : null,
    data?.payments?.latestSync ? 'Pagos' : null,
    Number(data?.costCenters?.total || 0) > 0 ? 'Centros de costo' : null,
    Number(data?.fixedAssets?.total || 0) > 0 ? 'Activos fijos' : null,
  ].filter(Boolean) as string[];

  return (
    <section className={compact ? 'rounded-lg border bg-card px-4 py-3' : 'rounded-lg border bg-card px-4 py-4'} aria-label="Conexión financiera Laudus">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-center gap-3">
          <LaudusSourceMark state={state} />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold">Laudus · fuente financiera</p>
              <span className="rounded-full border px-2 py-0.5 text-[10px] font-medium text-muted-foreground">solo lectura</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {error
                ? 'No fue posible confirmar el estado de la conexión.'
                : isLoading
                  ? 'Verificando conexión financiera…'
                  : `Actualizado ${freshness(data?.freshness?.latestOperationalSync)} · ${domains.length ? domains.join(' · ') : 'sin dominios financieros confirmados'}`}
            </p>
          </div>
        </div>
        {!compact ? (
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Landmark className="h-4 w-4" />
            <span>Laudus sigue siendo autoridad financiera; MOTIL organiza y concilia.</span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
