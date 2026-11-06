'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type ContractItem = {
  id: string;
  contract_number: string | null;
  title: string | null;
  contract_type: string | null;
  status: string | null;
  contractor_name: string | null;
  property_name: string | null;
  project_name: string | null;
  responsible_area: string | null;
  responsible_person: string | null;
  contract_value: number;
  currency: string;
  paid_amount: number;
  paid_percentage: number | null;
  pending_amount: number;
  billing_state: 'complete' | 'partial' | 'not_started' | 'unknown';
  days_until_end: number | null;
  timeline_state: 'overdue' | 'due_soon' | 'on_track' | 'unknown';
  execution_percentage: number | null;
  delta_percentage_points: number | null;
  review_due_date: string | null;
  end_date: string | null;
  compliance_status: string | null;
  compliance_notes: string | null;
  has_evidence: boolean;
  attention_reason: string | null;
};

type Payload = {
  data: ContractItem[];
  summary: {
    total: number;
    without_execution: number;
    payment_ahead_of_execution: number;
    without_evidence: number;
    with_attention: number;
    billing_complete: number;
    billing_partial: number;
    due_within_15_days: number;
    overdue: number;
  };
  policy: {
    comparison: string;
    interpretation: string;
    evidence: string;
    traffic_light: string;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el control contractual');
  return payload;
};

function money(value: number, currency: string) {
  return new Intl.NumberFormat('es-CL', {
    style: 'currency',
    currency: currency || 'CLP',
    maximumFractionDigits: 0,
  }).format(value);
}

function percentage(value: number | null) {
  if (value === null || Number.isNaN(value)) return '—';
  return `${value.toFixed(1)}%`;
}

export default function ContractControlPage() {
  const { data, error, isLoading } = useSWR<Payload>('/api/legal/contract-control', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <StatePanel tone="loading" title="Cargando control contractual" description="Comparando avance físico, pagos y respaldo documental." />;
  }

  if (error || !data) {
    return <StatePanel tone="error" title="Control contractual no disponible" description="No se estiman avances ni pagos faltantes." />;
  }

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Contratos y contratistas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Control contractual</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Avance físico, facturación, saldo, evidencia y fechas críticas sobre la misma fuente contractual.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-6">
        {[
          ['Contratos', data.summary.total],
          ['Sin avance físico', data.summary.without_execution],
          ['Facturación completa', data.summary.billing_complete],
          ['Facturación parcial', data.summary.billing_partial],
          ['Vencen ≤15 días', data.summary.due_within_15_days],
          ['Requieren revisión', data.summary.with_attention],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="divide-y overflow-hidden rounded-md border">
        {data.data.length ? data.data.map((item) => (
          <article key={item.id} className="p-4">
            <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">{item.contract_type || 'Contrato'}</Badge>
                  <Badge variant="outline">{item.status || 'Sin estado'}</Badge>
                  <Badge variant="outline">
                    {item.billing_state === 'complete' ? 'Facturación completa' : item.billing_state === 'partial' ? 'Facturación parcial' : item.billing_state === 'not_started' ? 'Sin facturación' : 'Facturación N/D'}
                  </Badge>
                  {item.timeline_state === 'overdue' ? <Badge variant="destructive">Plazo vencido</Badge> : null}
                  {item.timeline_state === 'due_soon' ? <Badge variant="secondary">Vence en {item.days_until_end} días</Badge> : null}
                  {item.attention_reason ? <Badge variant="secondary">Revisar</Badge> : null}
                  {!item.has_evidence ? <Badge variant="destructive">Sin respaldo</Badge> : null}
                </div>
                <h2 className="mt-2 text-sm font-semibold">{item.title || item.contract_number || 'Contrato sin título'}</h2>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.contractor_name, item.property_name, item.project_name].filter(Boolean).join(' · ') || 'Sin contexto adicional registrado'}
                </p>
                {item.attention_reason ? <p className="mt-2 text-sm">{item.attention_reason}</p> : null}
              </div>

              <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                <p>{item.timeline_state === 'overdue' ? 'Plazo vencido' : item.timeline_state === 'due_soon' ? `Vence en ${item.days_until_end} días` : item.end_date ? `Término: ${item.end_date}` : 'Sin fecha de término'}</p>
                <p className="mt-1">{item.review_due_date ? `Revisión: ${item.review_due_date}` : 'Sin fecha de revisión'}</p>
                <p className="mt-1">{item.responsible_person || item.responsible_area || 'Responsable no asignado'}</p>
              </div>
            </div>

            <div className="mt-3 grid gap-2 border-t pt-3 text-xs text-muted-foreground md:grid-cols-6">
              <p><span className="font-medium text-foreground">Valor</span><br />{money(item.contract_value, item.currency)}</p>
              <p><span className="font-medium text-foreground">Facturado / pagado</span><br />{money(item.paid_amount, item.currency)}</p>
              <p><span className="font-medium text-foreground">Saldo</span><br />{money(item.pending_amount, item.currency)}</p>
              <p><span className="font-medium text-foreground">Facturación %</span><br />{percentage(item.paid_percentage)}</p>
              <p><span className="font-medium text-foreground">Avance físico</span><br />{percentage(item.execution_percentage)}</p>
              <p><span className="font-medium text-foreground">Pago vs avance</span><br />{item.delta_percentage_points === null ? '—' : `${item.delta_percentage_points.toFixed(1)} pp`}</p>
            </div>
          </article>
        )) : (
          <p className="p-4 text-sm text-muted-foreground">
            No hay contratos registrados en la fuente canónica. MOTIL no simula avances ni pagos.
          </p>
        )}
      </section>

      <section className="rounded-md border bg-muted/20 p-4">
        <p className="text-sm font-semibold">Regla de lectura</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.policy.comparison}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.policy.interpretation}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.policy.evidence}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{data.policy.traffic_light}</p>
      </section>
    </div>
  );
}
