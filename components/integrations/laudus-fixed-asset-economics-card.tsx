'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Calculator, Database } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

type EconomicsRow = {
  canonicalAssetId: string | null;
  canonicalAssetCode: string | null;
  canonicalAssetName: string | null;
  name?: string | null;
  acquisitionDate?: string | null;
  acquisitionCost?: number | null;
  realizableValue?: number | null;
  usefulLife?: number | null;
  depreciationType?: string | null;
  invoiceNumber?: string | null;
  status: string;
  depreciationSummary?: {
    rows: number;
    firstYear: number | null;
    lastYear: number | null;
    amountTotal: number | null;
    accumulatedMax: number | null;
    amountWithInflationCorrectionTotal: number | null;
    accumulatedWithInflationCorrectionMax: number | null;
  } | null;
};

type Payload = {
  requested: number;
  available: number;
  withAcquisitionCost: number;
  results: EconomicsRow[];
  mode: 'read_only';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar economía Laudus');
  return payload as Payload;
};

const money = (value: number | null | undefined) => value == null
  ? 'Sin dato'
  : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

export function LaudusFixedAssetEconomicsCard() {
  const [enabled, setEnabled] = useState(false);
  const { data, error, isLoading } = useSWR<Payload>(enabled ? '/api/integrations/laudus/fixed-asset-economics' : null, fetcher, { revalidateOnFocus: false, revalidateIfStale: false });

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <CardTitle className="flex items-center gap-2"><Calculator className="h-4 w-4"/>Economía Laudus</CardTitle>
            <CardDescription>Costo de adquisición, vida útil y depreciación recuperados en lectura para candidatos de identidad fuerte.</CardDescription>
          </div>
          <div className="flex items-center gap-2"><Badge variant="outline">Sólo lectura</Badge><Button size="sm" variant="outline" onClick={() => setEnabled(true)} disabled={enabled && isLoading}>{enabled ? isLoading ? 'Consultando…' : 'Consultado' : 'Consultar Laudus'}</Button></div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? <p className="text-sm text-muted-foreground">Consulta bajo demanda para evitar llamadas innecesarias a la API de Laudus.</p> : null}
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Consultando economía de activos Laudus…</p> : null}
        {!isLoading && !error && data ? (
          <>
            <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Candidatos consultados</p><p className="mt-1 text-2xl font-semibold">{data.requested}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Detalle recuperado</p><p className="mt-1 text-2xl font-semibold">{data.available}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Con costo adquisición</p><p className="mt-1 text-2xl font-semibold">{data.withAcquisitionCost}</p></div>
            </div>
            <div className="divide-y overflow-hidden rounded-lg border">
              {data.results.filter((row) => row.status === 'available').map((row, index) => (
                <div key={row.canonicalAssetId || `${row.name || 'asset'}-${index}`} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_150px_120px_180px] lg:items-center">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2"><Database className="h-4 w-4 text-muted-foreground"/><p className="truncate font-medium">{row.canonicalAssetCode || 'Sin código'} · {row.canonicalAssetName || row.name || 'Activo'}</p></div>
                    <p className="mt-1 text-xs text-muted-foreground">Adquirido {row.acquisitionDate || 'sin fecha'} · factura {row.invoiceNumber || 'sin referencia'}</p>
                  </div>
                  <div><p className="text-xs text-muted-foreground">Costo adquisición</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(row.acquisitionCost)}</p></div>
                  <div><p className="text-xs text-muted-foreground">Vida útil</p><p className="mt-1 text-sm font-medium">{row.usefulLife == null ? 'Sin dato' : row.usefulLife}</p></div>
                  <div><p className="text-xs text-muted-foreground">Depreciación acumulada</p><p className="mt-1 text-sm font-semibold tabular-nums">{money(row.depreciationSummary?.accumulatedMax ?? row.depreciationSummary?.accumulatedWithInflationCorrectionMax)}</p></div>
                </div>
              ))}
              {!data.results.some((row) => row.status === 'available') ? <p className="p-6 text-center text-sm text-muted-foreground">No hay candidatos fuertes con detalle económico disponible.</p> : null}
            </div>
            <p className="text-xs text-muted-foreground">Esta evidencia no confirma identidad del activo por sí sola y no modifica ni Laudus ni Ficha 360.</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
