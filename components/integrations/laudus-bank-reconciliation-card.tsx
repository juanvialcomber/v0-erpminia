'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Landmark } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Item = { date: string | null; description: string | null; document: string | null; amount: number };
type Payload = {
  status: 'available' | 'empty' | 'unavailable';
  bankStatement: null | { dateFrom: string | null; dateTo: string | null; initialBalance: number | null };
  bankOnly: { count: number; amount: number; items: Item[] };
  journalOnly: { count: number; amount: number; items: Item[] };
  persisted: false;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar conciliación Laudus');
  return payload as Payload;
};

const money = (value: number) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));

export function LaudusBankReconciliationCard() {
  const [enabled, setEnabled] = useState(false);
  const { data, error, isLoading } = useSWR<Payload>(enabled ? '/api/integrations/laudus/bank-reconciliation' : null, fetcher, {
    revalidateOnFocus: false,
    revalidateIfStale: false,
  });

  return (
    <Card className="shadow-none">
      <CardHeader>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <LaudusSourceMark state={isLoading ? 'syncing' : error ? 'review' : data?.status === 'available' ? 'connected' : enabled ? 'review' : 'pending'} compact />
              <CardTitle className="flex items-center gap-2"><Landmark className="h-4 w-4"/>Conciliación bancaria Laudus</CardTitle>
            </div>
            <CardDescription>Consulta bajo demanda de diferencias banco ↔ libro. No contabiliza ni concilia automáticamente.</CardDescription>
          </div>
          <Button size="sm" variant="outline" onClick={() => setEnabled(true)} disabled={enabled && isLoading}>
            {enabled ? isLoading ? 'Consultando…' : 'Consultado' : 'Consultar Laudus'}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? <p className="text-sm text-muted-foreground">Se consulta sólo cuando se necesita para proteger el cupo mensual de la API.</p> : null}
        {error ? <p className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</p> : null}
        {data?.status === 'empty' ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">Laudus no devolvió una cartola bancaria disponible para conciliar.</p> : null}
        {data?.status === 'available' ? (
          <>
            <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Período cartola</p><p className="mt-1 text-sm font-semibold">{data.bankStatement?.dateFrom || '—'} → {data.bankStatement?.dateTo || '—'}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Banco sin asiento</p><p className="mt-1 text-2xl font-semibold">{data.bankOnly.count}</p><p className="mt-1 text-xs text-muted-foreground">{money(data.bankOnly.amount)}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Asiento sin banco</p><p className="mt-1 text-2xl font-semibold">{data.journalOnly.count}</p><p className="mt-1 text-xs text-muted-foreground">{money(data.journalOnly.amount)}</p></div>
            </div>
            {(data.bankOnly.items.length || data.journalOnly.items.length) ? (
              <div className="grid gap-4 lg:grid-cols-2">
                <div className="overflow-hidden rounded-lg border">
                  <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Banco sin asiento</div>
                  <div className="divide-y">{data.bankOnly.items.map((item, index) => <div key={`bank-${index}`} className="p-3"><p className="text-sm font-medium">{item.description || item.document || 'Movimiento bancario'}</p><p className="mt-1 text-xs text-muted-foreground">{item.date || 'Sin fecha'} · {money(item.amount)}</p></div>)}</div>
                </div>
                <div className="overflow-hidden rounded-lg border">
                  <div className="border-b px-4 py-2 text-xs font-semibold uppercase tracking-[0.1em] text-muted-foreground">Asiento sin banco</div>
                  <div className="divide-y">{data.journalOnly.items.map((item, index) => <div key={`journal-${index}`} className="p-3"><p className="text-sm font-medium">{item.description || item.document || 'Movimiento contable'}</p><p className="mt-1 text-xs text-muted-foreground">{item.date || 'Sin fecha'} · {money(item.amount)}</p></div>)}</div>
                </div>
              </div>
            ) : <Badge variant="secondary">Sin diferencias observadas en la cartola consultada</Badge>}
            <p className="text-xs text-muted-foreground">Esta consulta es diagnóstica y no persiste ni modifica conciliaciones en Laudus.</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
