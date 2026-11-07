'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { LaudusSourceMark } from '@/components/integrations/laudus-source-mark';

type ReviewRow = {
  id: string;
  kind: 'inventory_mismatch' | 'negative_stock';
  productId: string | null;
  sku: string | null;
  description: string | null;
  unit: string | null;
  operationalCategory: string | null;
  laudusStock: number | null;
  motilStock: number | null;
  delta: number | null;
  laudusSyncedAt: string | null;
  motilUpdatedAt: string | null;
  negativePositions: Array<{
    warehouse_name: string;
    warehouse_stock: number;
    total_laudus_stock: number;
    synced_at: string | null;
  }>;
};

type Payload = {
  rows: ReviewRow[];
  canDecide: boolean;
  summary: { pending: number; mismatches: number; negativeStock: number };
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la conciliación.');
  return payload;
};

const fmt = (value: number | null) => value == null ? '—' : value.toLocaleString('es-CL', { maximumFractionDigits: 2 });

export function LaudusInventoryReconciliationQueue() {
  const { data, error, isLoading, mutate } = useSWR<Payload>(
    '/api/integrations/laudus/inventory-reconciliation-review',
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
      const response = await fetch('/api/integrations/laudus/inventory-reconciliation-review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ reviewId: row.id, decision, reason: reason.trim() }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No fue posible registrar la decisión.');
      setReason('');
      setMessage(payload?.message || 'Decisión registrada.');
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
    return <section className="h-44 animate-pulse rounded-lg bg-muted" />;
  }

  if (!row) {
    return (
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4" />
          <div>
            <p className="text-sm font-medium">Conciliación de Bodega al día</p>
            <p className="mt-1 text-xs text-muted-foreground">No quedan diferencias Laudus pendientes de decisión humana.</p>
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
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Revisión Jefe de Bodega</p>
            <div className="mt-1 flex items-center gap-2"><h2 className="text-lg font-semibold">Conciliar evidencia Laudus</h2><LaudusSourceMark state="review" /></div>
            <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
              MOTIL no pudo resolver este caso de forma determinística. La decisión humana queda registrada y no cambia stock automáticamente.
            </p>
          </div>
          <div className="text-right text-xs text-muted-foreground">
            <p>{data?.summary.pending ?? 0} pendientes</p>
            <p>{data?.summary.mismatches ?? 0} diferencias · {data?.summary.negativeStock ?? 0} negativos</p>
          </div>
        </div>
      </div>

      <div className="grid gap-px bg-border md:grid-cols-2">
        <div className="bg-card p-4">
          <p className="font-mono text-xs text-muted-foreground">{row.sku || 'Sin SKU'}</p>
          <p className="mt-1 text-sm font-medium">{row.description || 'Producto sin descripción'}</p>
          <p className="mt-2 text-xs text-muted-foreground">{row.kind === 'negative_stock' ? 'Stock negativo Laudus' : 'Diferencia de saldo MOTIL vs Laudus'}</p>
          {row.operationalCategory ? <p className="mt-1 text-xs text-muted-foreground">Categoría: {row.operationalCategory}</p> : null}
        </div>
        <div className="bg-card p-4">
          {row.kind === 'inventory_mismatch' ? (
            <div className="grid grid-cols-3 gap-3 text-sm">
              <div><p className="text-xs text-muted-foreground">MOTIL</p><p className="mt-1 font-semibold tabular-nums">{fmt(row.motilStock)} {row.unit || ''}</p></div>
              <div><p className="text-xs text-muted-foreground">Laudus</p><p className="mt-1 font-semibold tabular-nums">{fmt(row.laudusStock)} {row.unit || ''}</p></div>
              <div><p className="text-xs text-muted-foreground">Diferencia</p><p className="mt-1 font-semibold tabular-nums">{row.delta != null && row.delta > 0 ? '+' : ''}{fmt(row.delta)} {row.unit || ''}</p></div>
            </div>
          ) : (
            <div className="space-y-2">
              {(row.negativePositions || []).map((position, index) => (
                <div key={index} className="flex items-center justify-between gap-3 text-xs">
                  <span className="text-muted-foreground">{position.warehouse_name || 'Bodega sin nombre'}</span>
                  <span className="font-semibold tabular-nums">{fmt(position.warehouse_stock)} {row.unit || ''}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="border-t px-4 py-4">
        <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <p className="text-xs leading-5 text-muted-foreground">
            Aprobar significa aceptar la evidencia Laudus para este caso. Rechazar significa que la evidencia no debe adoptarse. En ambos casos la razón queda guardada para aprender y programar futuras reglas automáticas.
          </p>
        </div>

        <div className="mt-3">
          <Input
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Razón obligatoria: conteo físico, movimiento faltante, dato Laudus incorrecto, etc."
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
          <p className="mt-2 text-right text-xs text-muted-foreground">Sólo el Jefe de Bodega o administración puede resolver estos casos.</p>
        ) : null}
      </div>
    </section>
  );
}
