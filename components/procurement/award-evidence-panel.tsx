'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar evidencia de adjudicación');
  return payload;
};

const money = (value: unknown, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString('es-CL')}`;
  }
};

type EvidenceRow = {
  id: string;
  quotation_number: string;
  request_id: string;
  currency: string;
  total_amount: number;
  lead_time_days?: number | null;
  payment_terms?: string | null;
  supplier?: { id: string; tax_id: string; legal_name: string; trade_name?: string | null } | null;
  request?: { request_number?: string | null; priority?: string | null; required_date?: string | null } | null;
  performance?: {
    operational_score?: number | null;
    evidence_dimensions?: number | null;
    completed_orders?: number | null;
    delivery_score?: number | null;
    delivery_scored_orders?: number | null;
    quality_score?: number | null;
    quantity_received?: number | null;
    invoice_score?: number | null;
    invoice_scored_count?: number | null;
    returns_count?: number | null;
  } | null;
};

const REASONS = [
  ['price', 'Precio'],
  ['lead_time', 'Plazo'],
  ['performance', 'Desempeño histórico'],
  ['urgency', 'Urgencia operacional'],
  ['commercial_terms', 'Condiciones comerciales'],
  ['continuity', 'Continuidad / proveedor habitual'],
  ['other', 'Otro'],
] as const;

export function AwardEvidencePanel() {
  const { mutate: mutateGlobal } = useSWRConfig();
  const { data, error, isLoading, mutate } = useSWR('/api/procurement/award-evidence', fetcher);
  const [reasons, setReasons] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const rows: EvidenceRow[] = data?.evidence || [];

  const groups = new Map<string, EvidenceRow[]>();
  for (const row of rows) {
    const current = groups.get(row.request_id) || [];
    current.push(row);
    groups.set(row.request_id, current);
  }

  const award = async (quote: EvidenceRow) => {
    const primaryReason = reasons[quote.id] || '';
    const decisionNotes = (notes[quote.id] || '').trim();
    if (!primaryReason) return setActionError('Selecciona el motivo de adjudicación antes de emitir la OC.');
    if (primaryReason === 'other' && !decisionNotes) return setActionError('Explica el motivo cuando selecciones Otro.');
    setBusyId(quote.id);
    setActionError(null);
    try {
      const response = await fetch('/api/procurement/award-evidence', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ quotationId: quote.id, primaryReason, decisionNotes }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo adjudicar la cotización.');
      await Promise.all([mutate(), mutateGlobal('/api/procurement/workflow')]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo adjudicar la cotización.');
    } finally {
      setBusyId(null);
    }
  };

  if (isLoading) return <Card id="procurement-award-decision" className="scroll-mt-24 shadow-none"><CardContent className="p-5 text-sm text-muted-foreground">Cargando evidencia para adjudicación…</CardContent></Card>;
  if (error) return <Card id="procurement-award-decision" className="scroll-mt-24 shadow-none"><CardContent className="p-5 text-sm text-destructive">{error.message}</CardContent></Card>;
  if (!rows.length) return null;

  return <Card id="procurement-award-decision" className="scroll-mt-24 shadow-none">
    <CardHeader>
      <CardTitle>Decisión de adjudicación</CardTitle>
      <CardDescription>Precio, plazo y desempeño se muestran por separado. Motil no combina estos factores en un ranking oculto ni adjudica automáticamente. La persona que adjudica debe registrar el motivo y Motil conserva el snapshot de evidencia usado en ese momento.</CardDescription>
    </CardHeader>
    <CardContent className="space-y-5">
      {actionError ? <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}
      {Array.from(groups.entries()).map(([requestId, quotes]) => {
        const request = quotes[0]?.request;
        const currencies = new Set(quotes.map((row) => row.currency || 'CLP'));
        const comparablePrice = currencies.size === 1;
        const minPrice = comparablePrice ? Math.min(...quotes.map((row) => Number(row.total_amount || 0))) : null;
        const leadTimes = quotes.map((row) => row.lead_time_days).filter((value): value is number => Number.isFinite(value));
        const minLead = leadTimes.length ? Math.min(...leadTimes) : null;

        return <section key={requestId} className="space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div><p className="font-medium">{request?.request_number || 'Solicitud'}</p><p className="text-xs text-muted-foreground">{quotes.length} cotización(es) recibida(s){request?.required_date ? ` · requerida ${request.required_date}` : ''}</p></div>
            {!comparablePrice ? <Badge variant="outline">Monedas distintas: no comparar precio directo</Badge> : null}
          </div>
          <div className="grid gap-3 lg:grid-cols-2 xl:grid-cols-3">
            {quotes.map((quote) => {
              const p = quote.performance;
              const supplierName = quote.supplier?.trade_name || quote.supplier?.legal_name || 'Proveedor';
              const reason = reasons[quote.id] || '';
              return <article key={quote.id} className="rounded-lg border p-4">
                <div className="flex items-start justify-between gap-3"><div><p className="font-medium">{supplierName}</p><p className="text-xs text-muted-foreground">{quote.quotation_number} · {quote.supplier?.tax_id || ''}</p></div><div className="flex flex-wrap justify-end gap-1">{minPrice != null && Number(quote.total_amount || 0) === minPrice ? <Badge variant="secondary">Menor precio</Badge> : null}{minLead != null && Number(quote.lead_time_days) === minLead ? <Badge variant="secondary">Menor plazo</Badge> : null}</div></div>
                <div className="mt-4 grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Precio</p><p className="font-medium">{money(quote.total_amount, quote.currency)}</p></div><div><p className="text-xs text-muted-foreground">Plazo</p><p className="font-medium">{quote.lead_time_days == null ? 'Sin dato' : `${quote.lead_time_days} días`}</p></div><div><p className="text-xs text-muted-foreground">Score operacional</p><p className="font-medium">{p?.operational_score == null ? 'Sin evidencia' : `${Number(p.operational_score).toFixed(0)}/100`}</p></div><div><p className="text-xs text-muted-foreground">Evidencia</p><p className="font-medium">{Number(p?.evidence_dimensions || 0)}/3 dimensiones</p></div></div>
                <div className="mt-3 border-t pt-3 text-xs text-muted-foreground"><p>Entrega: {p?.delivery_score == null ? '—' : `${Number(p.delivery_score).toFixed(0)}%`} · {Number(p?.delivery_scored_orders || 0)}/{Number(p?.completed_orders || 0)} OC evaluables</p><p>Calidad: {p?.quality_score == null ? '—' : `${Number(p.quality_score).toFixed(0)}%`} · {Number(p?.quantity_received || 0)} unidades recibidas</p><p>Factura: {p?.invoice_score == null ? '—' : `${Number(p.invoice_score).toFixed(0)}%`} · {Number(p?.invoice_scored_count || 0)} factura(s)</p><p>Devoluciones: {Number(p?.returns_count || 0)}</p></div>
                {quote.payment_terms ? <p className="mt-3 text-xs text-muted-foreground">Pago: {quote.payment_terms}</p> : null}
                <div className="mt-4 space-y-3 border-t pt-4">
                  <div><Label>Motivo principal</Label><Select value={reason} onValueChange={(value) => setReasons((current) => ({ ...current, [quote.id]: value }))}><SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar motivo" /></SelectTrigger><SelectContent>{REASONS.map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                  <div><Label>Nota de decisión {reason === 'other' ? '(obligatoria)' : '(opcional)'}</Label><Textarea className="mt-1" rows={2} value={notes[quote.id] || ''} onChange={(event) => setNotes((current) => ({ ...current, [quote.id]: event.target.value }))} placeholder="Contexto adicional de la adjudicación" /></div>
                  <Button className="w-full" onClick={() => award(quote)} disabled={busyId === quote.id || !reason}>{busyId === quote.id ? 'Adjudicando…' : 'Adjudicar y emitir OC'}</Button>
                </div>
              </article>;
            })}
          </div>
        </section>;
      })}
    </CardContent>
  </Card>;
}