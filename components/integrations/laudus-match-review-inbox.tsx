'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { Check, ClipboardCheck, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';

type Candidate = {
  invoice_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  score: number | null;
  next_score: number | null;
  match_status: 'ambiguous' | 'review';
  evidence: {
    product_coverage?: number;
    quantity_coverage?: number;
    warehouse_exact?: boolean;
    amount_within_0_5_pct?: boolean;
    day_gap?: number;
  };
};

type QueuePayload = {
  pending: Candidate[];
  reviewed: Array<{
    id: string;
    invoice_external_id: string;
    order_external_id: string;
    decision: 'approved' | 'rejected';
    reason: string;
    reviewed_at: string;
  }>;
  counts: { pending: number; approved: number; rejected: number; labelled: number };
  learning: {
    status: 'collecting_feedback' | 'ready_for_calibration';
    labelled: number;
    minimum: number;
    remaining: number;
    acceptanceRate: number | null;
    appliesToScoring: false;
  };
};

const fetcher = async (url: string): Promise<QueuePayload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la bandeja.');
  return payload;
};

const pct = (value?: number) =>
  typeof value === 'number' ? Math.round(value * 100) + '%' : '—';

export function LaudusMatchReviewInbox() {
  const { data, error, isLoading, mutate } = useSWR<QueuePayload>(
    '/api/integrations/laudus/match-reviews',
    fetcher,
    { revalidateOnFocus: false },
  );
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  const decide = async (candidate: Candidate, decision: 'approved' | 'rejected') => {
    const key = candidate.invoice_id + ':' + candidate.order_id;
    if (decision === 'rejected' && reason.trim().length < 3) {
      setMessage('Indica el motivo del rechazo.');
      return;
    }

    setSaving(key);
    setMessage('');
    try {
      const response = await fetch('/api/integrations/laudus/match-reviews', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          invoiceExternalId: candidate.invoice_id,
          orderExternalId: candidate.order_id,
          decision,
          reason: decision === 'rejected' ? reason.trim() : '',
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la decisión.');
      setRejecting(null);
      setReason('');
      setMessage(payload?.message || 'Decisión registrada.');
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la decisión.');
    } finally {
      setSaving(null);
    }
  };

  if (error) return null;

  const current = data?.pending?.[0];

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b px-4 py-4">
        <div>
          <div className="flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-muted-foreground" />
            <h2 className="text-sm font-semibold">Revisión de coincidencias</h2>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            Finanzas confirma o descarta la OC sugerida. La decisión no modifica Laudus, facturas ni pagos.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{isLoading ? '—' : data?.counts.pending || 0} pendientes visibles</Badge>
          <Badge variant="outline">
            {isLoading || !data ? 'Aprendiendo…' : data.learning.status === 'ready_for_calibration'
              ? 'Feedback listo para calibrar'
              : `Aprendiendo · ${data.learning.labelled}/${data.learning.minimum}`}
          </Badge>
        </div>
      </div>

      {isLoading ? (
        <div className="px-4 py-6 text-sm text-muted-foreground">Cargando candidatos…</div>
      ) : current ? (
        <div className="p-4">
          <div className="grid gap-4 lg:grid-cols-[1fr_auto] lg:items-start">
            <div>
              <p className="text-xs text-muted-foreground">Factura {current.doc_number || current.invoice_id}</p>
              <p className="mt-1 font-medium">{current.supplier_name || 'Proveedor sin nombre'}</p>
              <p className="mt-2 text-sm">
                OC candidata <span className="font-semibold">{current.order_number || current.order_id}</span>
                {typeof current.score === 'number' ? <span className="text-muted-foreground"> · confianza {current.score}/100</span> : null}
              </p>
              <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
                <span>Productos {pct(current.evidence?.product_coverage)}</span>
                <span>·</span>
                <span>Cantidades {pct(current.evidence?.quantity_coverage)}</span>
                <span>·</span>
                <span>{current.evidence?.warehouse_exact ? 'Misma bodega' : 'Bodega no confirmada'}</span>
                {typeof current.evidence?.day_gap === 'number' ? <>
                  <span>·</span>
                  <span>{current.evidence.day_gap} días entre OC y factura</span>
                </> : null}
              </div>
            </div>

            <div className="flex gap-2">
              <Button
                size="sm"
                disabled={saving === current.invoice_id + ':' + current.order_id}
                onClick={() => void decide(current, 'approved')}
              >
                <Check className="h-4 w-4" /> Aprobar
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={saving === current.invoice_id + ':' + current.order_id}
                onClick={() => {
                  setRejecting(current.invoice_id + ':' + current.order_id);
                  setMessage('');
                }}
              >
                <X className="h-4 w-4" /> Rechazar
              </Button>
            </div>
          </div>

          {rejecting === current.invoice_id + ':' + current.order_id ? (
            <div className="mt-4 rounded-md border bg-muted/20 p-3">
              <label className="text-xs font-medium" htmlFor="laudus-reject-reason">Motivo del rechazo</label>
              <Textarea
                id="laudus-reject-reason"
                className="mt-2 min-h-20"
                value={reason}
                onChange={(event) => setReason(event.target.value)}
                placeholder="Ej.: corresponde a otra OC, cantidad no coincide, proveedor correcto pero compra distinta…"
              />
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={saving === current.invoice_id + ':' + current.order_id || reason.trim().length < 3}
                  onClick={() => void decide(current, 'rejected')}
                >
                  Confirmar rechazo
                </Button>
                <Button size="sm" variant="ghost" onClick={() => { setRejecting(null); setReason(''); }}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}

          {message ? <p className="mt-3 text-xs text-muted-foreground">{message}</p> : null}

          <p className="mt-4 text-xs text-muted-foreground">
            Se muestra un caso a la vez para mantener la revisión rápida. MOTIL prioriza casos ambiguos e informativos; el feedback todavía no altera el score automáticamente.
          </p>
        </div>
      ) : (
        <div className="px-4 py-6">
          <p className="text-sm font-medium">Sin candidatos pendientes en esta tanda.</p>
          <p className="mt-1 text-xs text-muted-foreground">Las decisiones quedan guardadas como feedback para mejorar el matching.</p>
        </div>
      )}
    </section>
  );
}
