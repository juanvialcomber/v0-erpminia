'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Payload = {
  generatedAt: string;
  dateTo: string;
  records: number;
  persisted: false;
  source: 'Laudus';
  semantics: string;
  laudusMutated: false;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el balance Laudus');
  return payload as Payload;
};

export function LaudusBalanceSheetCard() {
  const [enabled, setEnabled] = useState(false);
  const { data, error, isLoading } = useSWR<Payload>(
    enabled ? '/api/integrations/laudus/balance-sheet' : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LaudusSourceMark state={isLoading ? 'syncing' : error ? 'review' : data ? 'connected' : 'pending'} compact />
              <CardTitle className="flex items-center gap-2"><Scale className="h-4 w-4" />Balance</CardTitle>
            </div>
            <CardDescription>Vista contable de 8 columnas con fuente Laudus.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEnabled(true)} disabled={enabled && isLoading}>
            {enabled ? isLoading ? 'Consultando…' : 'Consultado' : 'Consultar balance'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? <p className="text-sm text-muted-foreground">Consulta disponible bajo demanda.</p> : null}
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {data ? (
          <>
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">{data.records.toLocaleString('es-CL')} cuentas con actividad</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Corte {data.dateTo}. La vista evita sumar Activos, Pasivos, Gastos e Ingresos hasta validar oficialmente la jerarquía contable devuelta por Laudus.
              </p>
            </div>
            <p className="text-xs text-muted-foreground">Fuente: Laudus.</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
