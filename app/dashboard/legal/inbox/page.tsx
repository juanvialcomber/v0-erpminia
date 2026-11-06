'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, FileCheck2, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type InboxItem = {
  id: string;
  kind: 'legal_case' | 'payable';
  area: string;
  title: string;
  detail: string | null;
  due_date: string | null;
  days_until: number | null;
  overdue: boolean;
  timing_state: 'overdue' | 'due_soon' | 'on_track' | 'no_due_date';
  status: string;
  priority: 'critical' | 'high' | 'medium' | 'low';
  owner: string | null;
  evidence_status: string;
  management_ready?: boolean;
  signatures_required: number | null;
  signatures_done: number | null;
  amount: number | null;
  currency: string | null;
  source_href: string;
  next_action: string;
};

type InboxResponse = {
  data: InboxItem[];
  warnings: string[];
  summary: {
    total: number;
    overdue: number;
    due_next_7_days: number;
    waiting_signatures: number;
    evidence_pending: number;
    ready_for_management: number;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar Inbox Legal');
  return payload;
};

function dueLabel(item: InboxItem) {
  if (!item.due_date) return 'Sin plazo registrado';
  if (item.days_until === null) return item.due_date;
  if (item.days_until < 0) return `Vencido hace ${Math.abs(item.days_until)} días`;
  if (item.days_until === 0) return 'Vence hoy';
  return `Vence en ${item.days_until} días`;
}

function moneyLabel(item: InboxItem) {
  if (item.amount === null || item.amount === undefined) return null;
  const currency = item.currency || 'CLP';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency }).format(item.amount);
}

export default function LegalInboxPage() {
  const { data, error, isLoading, mutate } = useSWR<InboxResponse>('/api/legal/inbox', fetcher, {
    revalidateOnFocus: false,
  });

  if (isLoading) {
    return <StatePanel tone="loading" title="Cargando Inbox Legal" description="Consolidando obligaciones y vencimientos reales." />;
  }

  if (error || !data) {
    return <StatePanel tone="error" title="Inbox Legal no disponible" description="No se reemplazan datos faltantes por estados inferidos." />;
  }

  return (
    <div className="space-y-5">
      <header className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Bandeja operacional</p>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight">Inbox</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Todo lo que requiere atención, firma, evidencia o cierre en un solo lugar.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void mutate()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </header>

      {data.warnings.length ? (
        <StatePanel tone="warning" title="Inbox parcial" description={data.warnings.join(' ')} className="min-h-0" />
      ) : null}

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-3 lg:grid-cols-6">
        {[
          ['Pendientes', data.summary.total],
          ['Vencidos', data.summary.overdue],
          ['Próx. 7 días', data.summary.due_next_7_days],
          ['Esperando firmas', data.summary.waiting_signatures],
          ['Listos Gerencia', data.summary.ready_for_management],
          ['Evidencia pendiente', data.summary.evidence_pending],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold">{value}</p>
          </div>
        ))}
      </section>

      <section className="divide-y overflow-hidden rounded-md border">
        {data.data.length ? data.data.map((item) => {
          const amount = moneyLabel(item);
          const waitingSignatures = item.signatures_required !== null
            && item.signatures_done !== null
            && item.signatures_done < item.signatures_required;

          return (
            <article key={item.id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="outline">{item.area}</Badge>
                    {item.timing_state === 'overdue' ? <Badge variant="destructive">Vencido</Badge> : null}
                    {item.timing_state === 'due_soon' ? <Badge variant="secondary">Próximo</Badge> : null}
                    {item.timing_state === 'on_track' ? <Badge variant="outline">En plazo</Badge> : null}
                    {item.timing_state === 'no_due_date' ? <Badge variant="outline">Sin fecha</Badge> : null}
                    {waitingSignatures ? <Badge variant="secondary">{item.signatures_done}/{item.signatures_required} firmas</Badge> : null}
                    {item.management_ready ? <Badge variant="secondary">Listo para Gerencia</Badge> : null}
                    <Badge variant="outline">Evidencia: {item.evidence_status === 'complete' ? 'completa' : 'pendiente'}</Badge>
                  </div>
                  <h2 className="mt-2 text-sm font-semibold">{item.title}</h2>
                  {item.detail ? <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p> : null}
                  {amount ? <p className="mt-2 text-sm font-medium">{amount}</p> : null}
                  <p className="mt-2 text-sm"><span className="font-medium">Siguiente acción:</span> {item.next_action}</p>
                </div>
                <div className="shrink-0 text-xs text-muted-foreground md:text-right">
                  <p className={item.overdue ? 'font-medium text-destructive' : ''}>{dueLabel(item)}</p>
                  <p className="mt-1">{item.owner || 'Responsable no asignado'}</p>
                  <p className="mt-1">{item.status.replaceAll('_', ' ')}</p>
                </div>
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <Button asChild variant="ghost" size="sm">
                  <Link href={item.source_href}>
                    {item.next_action} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
                {item.evidence_status === 'complete' ? (
                  <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                    <FileCheck2 className="h-3.5 w-3.5" />
                    Evidencia registrada
                  </span>
                ) : null}
              </div>
            </article>
          );
        }) : (
          <p className="p-4 text-sm text-muted-foreground">No hay asuntos abiertos en las fuentes disponibles.</p>
        )}
      </section>
    </div>
  );
}
