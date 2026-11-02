'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { BookOpen, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Center = {
  centerId: string;
  code: string | null;
  name: string | null;
  entries: number;
  debit: number;
  credit: number;
  latestDate: string | null;
  reconciliationStatus: string | null;
};

type Entry = {
  externalId: string;
  entryNumber: string | null;
  entryDate: string | null;
  journalCode: string | null;
  entryType: string | null;
  description: string | null;
  costCenterExternalId: string | null;
  costCenterCode: string | null;
  costCenterName: string | null;
  debitTotal: number;
  creditTotal: number;
  currency: string;
};

type Payload = {
  summary: { totalEntries: number; entriesWithCostCenter: number; costCenterCoveragePct: number };
  freshness: { healthStatus: string; lastSuccessAt: string | null; lastError: string | null };
  sample: { entriesRead: number; maxRows: number };
  byCenter: Center[];
  recentEntries: Entry[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar movimiento contable');
  return payload as Payload;
};

const money = (value: unknown, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString('es-CL')}`;
  }
};

export function LaudusAccountingCostCenters() {
  const { data, error, isLoading } = useSWR<Payload>('/api/integrations/laudus/accounting-cost-centers', fetcher, { revalidateOnFocus: false });
  const [query, setQuery] = useState('');
  const needle = query.trim().toLowerCase();

  const centers = useMemo(() => (data?.byCenter || []).filter((row) => {
    if (!needle) return true;
    return `${row.code || ''} ${row.name || ''}`.toLowerCase().includes(needle);
  }), [data?.byCenter, needle]);

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2"><LaudusSourceMark state={isLoading ? 'syncing' : error ? 'review' : data?.freshness.healthStatus === 'healthy' ? 'connected' : 'review'} compact /><CardTitle className="flex items-center gap-2"><BookOpen className="h-4 w-4"/>Movimiento contable Laudus</CardTitle></div>
            <CardDescription>Lectura por centro de costo para análisis dentro de MOTIL. No representa saldo contable actual ni modifica asientos.</CardDescription>
          </div>
          {data ? <div className="flex flex-wrap gap-2"><Badge variant="outline">{data.summary.totalEntries.toLocaleString('es-CL')} asientos alojados</Badge><Badge variant={data.summary.costCenterCoveragePct > 0 ? 'secondary' : 'destructive'}>{data.summary.costCenterCoveragePct}% con centro</Badge></div> : null}
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-muted-foreground"/>
          <Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar centro de costo" />
        </div>
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {isLoading ? <p className="text-sm text-muted-foreground">Cargando movimientos Laudus…</p> : null}
        {!isLoading && !error && data?.summary.entriesWithCostCenter === 0 ? (
          <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
            <p className="text-sm font-medium">La relación asiento → centro de costo todavía no está disponible en la copia actual.</p>
            <p className="mt-1 text-xs text-muted-foreground">
              MOTIL conserva {data.summary.totalEntries.toLocaleString('es-CL')} cabeceras de asientos, pero el centro de costo vive a nivel de línea en Laudus. No se atribuyen movimientos a centros por suposición.
            </p>
            {data.freshness.lastError ? <p className="mt-2 text-xs text-muted-foreground">Sync contable: {data.freshness.lastError}</p> : null}
          </div>
        ) : null}
        {!isLoading && !error && data?.summary.entriesWithCostCenter > 0 ? (
          <div className="divide-y overflow-hidden rounded-lg border">
            {centers.length ? centers.slice(0, 50).map((row) => (
              <div key={row.centerId} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1.2fr)_110px_150px_150px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{row.code || row.centerId} · {row.name || 'Centro sin nombre'}</p>
                    {row.reconciliationStatus && row.reconciliationStatus !== 'matched' ? <Badge variant="outline">Revisar vínculo</Badge> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">Último movimiento observado: {row.latestDate ? new Date(row.latestDate).toLocaleDateString('es-CL') : 'sin fecha'}</p>
                </div>
                <div className="text-sm text-muted-foreground">{row.entries.toLocaleString('es-CL')} asientos</div>
                <div className="text-sm tabular-nums lg:text-right"><span className="text-xs text-muted-foreground">Debe</span><br/>{money(row.debit)}</div>
                <div className="text-sm tabular-nums lg:text-right"><span className="text-xs text-muted-foreground">Haber</span><br/>{money(row.credit)}</div>
              </div>
            )) : <p className="p-6 text-center text-sm text-muted-foreground">No hay centros para este filtro.</p>}
          </div>
        ) : null}
        <p className="text-xs text-muted-foreground">El resumen usa una ventana acotada de hasta 1.000 asientos recientes para evitar consultas pesadas. La contabilidad oficial permanece en Laudus.</p>
      </CardContent>
    </Card>
  );
}
