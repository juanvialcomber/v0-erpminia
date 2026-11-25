'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type Row = {
  id: string;
  kind: 'accounts_payable_inconsistency' | 'invoice_trace' | 'purchase_order_reconciliation' | 'cost_center_reconciliation';
  issueType: string;
  evidenceReference: string | null;
};

type Payload = {
  rows: Row[];
  canDecide: boolean;
  owner: { cargo: string; area: string };
  summary: { pending: number; accountsPayable: number; purchaseOrders: number; costCenters: number; trace: number };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la conciliación financiera.');
  return payload;
};

function label(row: Row) {
  if (row.kind === 'accounts_payable_inconsistency') return 'Cuenta por pagar inconsistente';
  if (row.kind === 'purchase_order_reconciliation') return 'OC pendiente de conciliación';
  if (row.kind === 'cost_center_reconciliation') return 'Centro de costo pendiente';
  return 'Trazabilidad de factura';
}

export function LaudusFinanceReconciliationQueue() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/finance-reconciliation-review',
    fetcher,
    { revalidateOnFocus: false },
  );
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState<'approve' | 'reject' | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const row = data?.rows?.[0] || null;

  async function decide(decision: 'approve' | 'reject') {
    if (!row || saving) return;
    if (reason.trim().length < 5) {
      setMessage('Registra una razón concreta antes de aprobar o rechazar.');
      return;
    }
    setSaving(decision);
    setMessage(null);
    try {
      const response = await fetch('/api/integrations/laudus/finance-reconciliation-review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewId: row.id, decision, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la decisión.');
      setReason('');
      setMessage(decision === 'approve' ? 'Caso aprobado y registrado.' : 'Caso rechazado y motivo registrado.');
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No fue posible registrar la decisión.');
    } finally {
      setSaving(null);
    }
  }

  // Only the authorized decision maker receives a task; read-only users keep their financial overview.
  if (error || isLoading || !data?.canDecide || !row) return null;

  return (
    <section className="rounded-lg border bg-card">
      <div className="border-b px-4 py-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Administración y Finanzas</p>
            <div className="mt-1 flex items-center gap-2">
              <h2 className="text-lg font-semibold">Conciliar excepción Laudus</h2>
              <LaudusSourceMark state="review" />
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              Revisa el respaldo y decide si corresponde aceptar la conciliación. Esto no modifica pagos ni facturas.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Responsable: {data?.owner?.cargo || 'Gerente de Finanzas'}</p>
            <p>{data?.summary.pending ?? 0} pendientes · {data?.summary.accountsPayable ?? 0} CxP · {data?.summary.purchaseOrders ?? 0} OC · {data?.summary.costCenters ?? 0} centros · {data?.summary.trace ?? 0} trazabilidad</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-md border bg-muted/20 p-3">
          <p className="text-xs text-muted-foreground">{label(row)}</p>
          <p className="mt-1 text-sm font-medium">{row.issueType}</p>
          <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{row.evidenceReference || 'Sin evidencia adicional.'}</p>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/20 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Aprobar acepta esta evidencia para la conciliación. Rechazar conserva el caso como evidencia no adoptada. El motivo queda registrado.
          </p>
        </div>

        <div className="mt-3">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Razón obligatoria: error de fecha Laudus, documento corregido, evidencia externa, etc."
            disabled={!data?.canDecide || Boolean(saving)}
          />
        </div>

        {message ? <p className="mt-2 text-xs text-muted-foreground">{message}</p> : null}

        <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button
            type="button"
            variant="outline"
            disabled={!data?.canDecide || Boolean(saving) || reason.trim().length < 5}
            onClick={() => void decide('reject')}
          >
            <XCircle className="mr-2 h-4 w-4" />
            {saving === 'reject' ? 'Registrando…' : 'Rechazar'}
          </Button>
          <Button
            type="button"
            disabled={!data?.canDecide || Boolean(saving) || reason.trim().length < 5}
            onClick={() => void decide('approve')}
          >
            <CheckCircle2 className="mr-2 h-4 w-4" />
            {saving === 'approve' ? 'Registrando…' : 'Aprobar'}
          </Button>
        </div>

        {!data?.canDecide ? (
          <p className="mt-2 text-right text-xs text-muted-foreground">Sólo Administración y Finanzas, el Jefe de Planificación como líder del proyecto Laudus o administración puede resolver estos casos.</p>
        ) : null}
      </div>
    </section>
  );
}
