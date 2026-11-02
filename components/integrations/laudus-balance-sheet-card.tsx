'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Scale } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Row = {
  accountId?: number;
  accountNumber?: string | null;
  accountName?: string | null;
  debit?: number | null;
  credit?: number | null;
  debitBalance?: number;
  creditBalance?: number;
  assets?: number;
  liabilities?: number;
  expenses?: number;
  incomes?: number;
};

type Payload = {
  generatedAt: string;
  dateTo: string;
  rows: Row[];
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

const money = (value: number) =>
  new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: 'CLP',
    maximumFractionDigits: 0,
  }).format(Number(value || 0));

export function LaudusBalanceSheetCard() {
  const [enabled, setEnabled] = useState(false);
  const { data, error, isLoading } = useSWR<Payload>(
    enabled ? '/api/integrations/laudus/balance-sheet' : null,
    fetcher,
    { revalidateOnFocus: false, revalidateIfStale: false },
  );

  const totals = (data?.rows || []).reduce<{ assets: number; liabilities: number; expenses: number; incomes: number }>(
    (acc, row) => ({
      assets: acc.assets + Number(row.assets || 0),
      liabilities: acc.liabilities + Number(row.liabilities || 0),
      expenses: acc.expenses + Number(row.expenses || 0),
      incomes: acc.incomes + Number(row.incomes || 0),
    }),
    { assets: 0, liabilities: 0, expenses: 0, incomes: 0 },
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
            <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Activos</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totals.assets)}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Pasivos</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totals.liabilities)}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Gastos</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totals.expenses)}</p></div>
              <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Ingresos</p><p className="mt-1 text-lg font-semibold tabular-nums">{money(totals.incomes)}</p></div>
            </div>
            <p className="text-xs text-muted-foreground">Fecha de corte: {data.dateTo} · {data.records.toLocaleString('es-CL')} cuentas · Fuente: Laudus.</p>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}
