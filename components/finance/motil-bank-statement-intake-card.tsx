'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type StatementSummary = {
  statement_import_id: string;
  source_name: string;
  bank_account_label: string;
  currency: string;
  period_from: string | null;
  period_to: string | null;
  transaction_count: number;
  matched_count: number;
  open_count: number;
  net_movement: number;
  imported_at: string;
};

type Payload = {
  statements: StatementSummary[];
  sourceAuthority: 'MOTIL';
  laudusRequired: false;
  automaticReconciliation: false;
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar extractos.');
  return payload;
};

function parseRows(text: string, currency: string) {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const separator = line.includes(';') ? ';' : '\t';
      const [transaction_date, description, amount, reference = '', running_balance = ''] = line
        .split(separator)
        .map((value) => value.trim());
      return {
        transaction_date,
        description,
        amount: Number(String(amount || '').replace(/\./g, '').replace(',', '.')),
        reference: reference || null,
        running_balance: running_balance
          ? Number(String(running_balance).replace(/\./g, '').replace(',', '.'))
          : null,
        currency,
        source_row: index + 1,
      };
    });
}

export function MotilBankStatementIntakeCard() {
  const { data, error, mutate } = useSWR<Payload>(
    '/api/finance/bank-statements',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );
  const [sourceName, setSourceName] = useState('');
  const [account, setAccount] = useState('');
  const [currency, setCurrency] = useState('CLP');
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [rowsText, setRowsText] = useState('');
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => parseRows(rowsText, currency), [rowsText, currency]);
  const invalidRows = rows.filter((row) =>
    !/^\d{4}-\d{2}-\d{2}$/.test(row.transaction_date)
    || !row.description
    || !Number.isFinite(row.amount),
  ).length;

  async function importStatement() {
    if (!sourceName.trim() || !account.trim() || rows.length === 0 || invalidRows > 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch('/api/finance/bank-statements', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          sourceName: sourceName.trim(),
          bankAccountLabel: account.trim(),
          currency,
          periodFrom: periodFrom || null,
          periodTo: periodTo || null,
          transactions: rows,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible importar el extracto.');
      setMessage(payload?.message || 'Extracto importado.');
      setRowsText('');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No fue posible importar el extracto.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Fuente bancaria MOTIL</CardTitle>
        <CardDescription>
          Importa evidencia bancaria propia. Laudus no es requerido y ningún pago se concilia automáticamente.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
        {message ? <p className="text-sm text-muted-foreground">{message}</p> : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="space-y-2"><Label>Banco / fuente</Label><Input value={sourceName} onChange={(e) => setSourceName(e.target.value)} placeholder="Ej. Banco de Chile"/></div>
          <div className="space-y-2"><Label>Cuenta</Label><Input value={account} onChange={(e) => setAccount(e.target.value)} placeholder="Cuenta corriente principal"/></div>
          <div className="space-y-2"><Label>Moneda</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value.toUpperCase())}/></div>
          <div className="space-y-2"><Label>Período</Label><div className="grid grid-cols-2 gap-2"><Input type="date" value={periodFrom} onChange={(e) => setPeriodFrom(e.target.value)}/><Input type="date" value={periodTo} onChange={(e) => setPeriodTo(e.target.value)}/></div></div>
        </div>

        <div className="space-y-2">
          <Label>Movimientos</Label>
          <Textarea
            value={rowsText}
            onChange={(e) => setRowsText(e.target.value)}
            rows={7}
            placeholder={'YYYY-MM-DD;Descripción;Monto;Referencia;Saldo\n2026-11-03;Transferencia proveedor;-1500000;TRX-123;45000000'}
          />
          <p className="text-xs text-muted-foreground">
            Formato por línea: fecha; descripción; monto; referencia; saldo. Se aceptan montos positivos o negativos. Antes de importar: {rows.length} filas · {invalidRows} inválidas.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">La importación sólo crea evidencia bancaria. El match con pagos requiere revisión posterior.</p>
          <Button disabled={busy || !sourceName.trim() || !account.trim() || rows.length === 0 || invalidRows > 0} onClick={() => void importStatement()}>
            {busy ? 'Importando…' : 'Importar extracto'}
          </Button>
        </div>

        {data?.statements?.length ? (
          <div className="divide-y rounded-lg border">
            {data.statements.slice(0, 5).map((statement) => (
              <div key={statement.statement_import_id} className="grid gap-2 p-3 text-sm sm:grid-cols-[1fr_120px_120px] sm:items-center">
                <div><p className="font-medium">{statement.source_name} · {statement.bank_account_label}</p><p className="text-xs text-muted-foreground">{statement.transaction_count} movimientos · {statement.open_count} pendientes de conciliación</p></div>
                <p className="text-xs text-muted-foreground">{statement.period_to || statement.imported_at.slice(0,10)}</p>
                <p className="text-right font-medium">{Number(statement.net_movement || 0).toLocaleString('es-CL')} {statement.currency}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Aún no hay extractos bancarios propios importados en MOTIL.</p>
        )}
      </CardContent>
    </Card>
  );
}
