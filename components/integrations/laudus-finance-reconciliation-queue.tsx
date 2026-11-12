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
  fieldName?: string | null;
  evidenceReference: string | null;
  resolutionNote?: string | null;
  priority?: 'high_confidence' | 'conflict' | 'review';
};

type Payload = {
  rows: Row[];
  canDecide: boolean;
  owner: { cargo: string; area: string };
  summary: { pending: number; accountsPayable: number; purchaseOrders: number; costCenters: number; trace: number; highConfidence?: number; conflicts?: number };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la conciliación financiera.');
  return payload;
};

function priorityLabel(row: Row) {
  if (row.priority === 'high_confidence') return 'Alta confianza';
  if (row.priority === 'conflict') return 'Conflicto';
  return 'Revisión';
}

function priorityClass(row: Row) {
  if (row.priority === 'high_confidence') return 'border-emerald-500/30 bg-emerald-500/5 text-emerald-700 dark:text-emerald-300';
  if (row.priority === 'conflict') return 'border-destructive/30 bg-destructive/5 text-destructive';
  return 'border-border bg-muted/20 text-muted-foreground';
}

function label(row: Row) {
  if (row.kind === 'accounts_payable_inconsistency') return 'CxP inconsistente';
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

  if (error) {
    return <section className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</section>;
  }

  if (isLoading) {
    return <section className="h-40 animate-pulse rounded-lg bg-muted" />;
  }

  if (!row) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <div>
            <p className="text-sm font-medium">Conciliación financiera al día</p>
            <p className="mt-1 text-xs text-muted-foreground">No quedan excepciones Laudus pendientes de decisión humana.</p>
          </div>
        </div>
      </section>
    );
  }

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
              MOTIL prioriza primero los casos con candidato fuerte y separa los conflictos. La decisión queda registrada y no modifica pagos, facturas, asientos ni Laudus automáticamente.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>Responsable: {data?.owner?.cargo || 'Gerente de Finanzas'}</p>
            <p>{data?.summary.pending ?? 0} pendientes · {data?.summary.highConfidence ?? 0} alta confianza · {data?.summary.conflicts ?? 0} conflictos</p>
            <p>{data?.summary.accountsPayable ?? 0} CxP · {data?.summary.purchaseOrders ?? 0} OC · {data?.summary.costCenters ?? 0} centros · {data?.summary.trace ?? 0} trazabilidad</p>
          </div>
        </div>
      </div>

      <div className="px-4 py-4">
        <div className="rounded-md border bg-muted/20 p-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">{label(row)}</p>
            <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${priorityClass(row)}`}>
              {priorityLabel(row)}
            </span>
          </div>
          <p className="mt-1 text-sm font-medium">{row.issueType}</p>
          {row.fieldName ? <p className="mt-1 text-xs text-muted-foreground">Campo: {row.fieldName}</p> : null}
          {row.resolutionNote ? (
            <p className="mt-2 rounded border bg-background/60 px-2.5 py-2 text-xs leading-5 text-foreground">
              {row.resolutionNote}
            </p>
          ) : null}
          <p className="mt-2 break-words text-xs leading-5 text-muted-foreground">{row.evidenceReference || 'Sin evidencia adicional.'}</p>
        </div>

        <div className="mt-3 flex items-start gap-2 rounded-md border bg-muted/20 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Aprobar acepta la revisión humana sobre esta evidencia; no asigna proveedor ni cambia el documento automáticamente. Rechazar conserva el caso como evidencia no adoptada. El motivo queda disponible para mejorar reglas futuras.
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
