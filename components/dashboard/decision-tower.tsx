'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CheckCircle2, Gauge, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type Severity = 'critical' | 'warning' | 'info';

type ExecutiveDecision = {
  id: string;
  category: 'maintenance' | 'preventive' | 'inventory' | 'documents' | 'finance' | string;
  severity: Severity;
  title: string;
  description: string;
  responsibleArea: string;
  dueDate: string | null;
  href: string;
};

type ExecutivePayload = {
  decisions?: ExecutiveDecision[];
  generatedAt?: string;
};

type ValueScorecard = {
  maintenanceValue?: {
    lecv?: string;
    workflowLevel?: number;
    evidenceLevel?: string;
    coverageLevel?: string;
    valueLevel?: string;
    supervisorReview?: {
      reviewedClosed?: number;
      approvedClosed?: number;
      medianCloseToReviewSeconds?: number | null;
    };
    executionTrend?: {
      e3Gate?: string;
      evidenceGate?: string;
      changePct?: number | null;
    };
  };
  financePriorityDecision?: {
    lecv?: string;
    workflowLevel?: number;
    evidenceLevel?: string;
    coverageLevel?: string;
    valueLevel?: string;
    total?: number;
    outcomes?: {
      maturedAccepted?: number;
      improved?: number;
      unchanged?: number;
      worsened?: number;
      e3Gate?: string;
    };
  };
};

async function fetchJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la Torre de Decisiones.');
  return payload as T;
}

const severityRank: Record<Severity, number> = { critical: 0, warning: 1, info: 2 };
const severityLabel: Record<Severity, string> = { critical: 'Crítica', warning: 'Atención', info: 'Informativa' };

function n(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? new Intl.NumberFormat('es-CL').format(numeric) : '—';
}

function lecvFor(decision: ExecutiveDecision, value?: ValueScorecard) {
  if (decision.category === 'maintenance' || decision.category === 'preventive') {
    return value?.maintenanceValue?.lecv || 'LECV pendiente';
  }
  if (decision.category === 'finance') {
    return value?.financePriorityDecision?.lecv || 'LECV pendiente';
  }
  return 'LECV pendiente';
}

function outcomeFor(decision: ExecutiveDecision, value?: ValueScorecard) {
  if (decision.category === 'maintenance' || decision.category === 'preventive') {
    const review = value?.maintenanceValue?.supervisorReview;
    const trend = value?.maintenanceValue?.executionTrend;
    if (!review && !trend) return 'Sin outcome conectado todavía.';
    return [
      review?.reviewedClosed != null ? `${n(review.reviewedClosed)} cierres revisados` : null,
      trend?.evidenceGate || null,
      trend?.e3Gate || 'HOLD_E3',
    ].filter(Boolean).join(' · ');
  }

  if (decision.category === 'finance') {
    const outcomes = value?.financePriorityDecision?.outcomes;
    if (!outcomes) return 'Sin outcomes maduros todavía.';
    return [
      `${n(outcomes.maturedAccepted || 0)} maduros`,
      `${n(outcomes.improved || 0)} mejoraron después`,
      outcomes.e3Gate || 'HOLD_E3',
    ].join(' · ');
  }

  return 'Outcome LECV aún no instrumentado para este dominio.';
}

export function DecisionTower() {
  const executive = useSWR<ExecutivePayload>('/api/dashboard/ia-operacional', fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });
  const value = useSWR<ValueScorecard>('/api/value/scorecard', fetchJson, {
    revalidateOnFocus: false,
    refreshInterval: 60_000,
  });

  const decisions = [...(executive.data?.decisions || [])]
    .sort((a, b) => {
      const severity = severityRank[a.severity] - severityRank[b.severity];
      if (severity !== 0) return severity;
      const aDue = a.dueDate ? Date.parse(a.dueDate) : Number.POSITIVE_INFINITY;
      const bDue = b.dueDate ? Date.parse(b.dueDate) : Number.POSITIVE_INFINITY;
      return aDue - bDue;
    })
    .slice(0, 5);

  const refresh = async () => {
    await Promise.all([executive.mutate(), value.mutate()]);
  };

  if (executive.error) {
    return (
      <Card className="border-dashed shadow-none">
        <CardContent className="p-5 text-sm text-muted-foreground">
          La Torre de Decisiones no puede construirse con evidencia completa. La bandeja ejecutiva permanece disponible abajo.
        </CardContent>
      </Card>
    );
  }

  return (
    <section className="overflow-hidden rounded-xl border bg-card" aria-label="Torre de Decisiones">
      <div className="flex flex-col gap-3 border-b px-5 py-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Gauge className="h-4 w-4 text-muted-foreground" />
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Torre de Decisiones</p>
          </div>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">5 decisiones de mayor presión</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            Evidencia → responsable → acción → outcome posterior → LECV. La Torre no ejecuta decisiones ni convierte asociación temporal en ROI.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => void refresh()} disabled={executive.isLoading || value.isLoading}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Actualizar
        </Button>
      </div>

      {executive.isLoading ? (
        <div className="space-y-2 p-5">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-28 animate-pulse rounded-lg bg-muted" />
          ))}
        </div>
      ) : decisions.length === 0 ? (
        <div className="p-8 text-center">
          <CheckCircle2 className="mx-auto h-6 w-6 text-muted-foreground" />
          <p className="mt-3 font-medium">Sin decisiones ejecutivas activas</p>
          <p className="mt-1 text-sm text-muted-foreground">La ausencia se basa en la fuente ejecutiva actual, no en inferencia de la Torre.</p>
        </div>
      ) : (
        <div className="divide-y">
          {decisions.map((decision, index) => {
            const lecv = lecvFor(decision, value.data);
            const outcome = outcomeFor(decision, value.data);
            return (
              <div key={decision.id} className="grid gap-4 p-4 lg:grid-cols-[48px_minmax(0,1fr)_190px_220px_auto] lg:items-center">
                <div className="flex h-9 w-9 items-center justify-center rounded-full border text-sm font-semibold">
                  {index + 1}
                </div>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={decision.severity === 'critical' ? 'destructive' : 'outline'}>
                      {severityLabel[decision.severity]}
                    </Badge>
                    <Badge variant="secondary">{decision.category}</Badge>
                  </div>
                  <p className="mt-2 font-medium">{decision.title}</p>
                  <p className="mt-1 text-sm text-muted-foreground">{decision.description}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Responsable</p>
                  <p className="mt-1 font-medium">{decision.responsibleArea || 'Sin asignar'}</p>
                  <p className="mt-3 text-xs text-muted-foreground">LECV</p>
                  <p className="mt-1 font-medium">{lecv}</p>
                </div>
                <div className="text-sm">
                  <p className="text-xs text-muted-foreground">Outcome posterior</p>
                  <p className="mt-1 leading-5">{outcome}</p>
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    “Mejoró después” nunca significa causalidad demostrada.
                  </p>
                </div>
                <Button asChild size="sm" variant={decision.severity === 'critical' ? 'default' : 'outline'}>
                  <Link href={decision.href}>
                    Resolver <ArrowRight className="ml-2 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      )}

      <div className="border-t bg-muted/15 px-5 py-3 text-xs text-muted-foreground">
        Corte actual de la bandeja ejecutiva. LECV sólo se muestra cuando el dominio ya tiene instrumentación explícita; los demás permanecen pendientes en vez de inferirse.
      </div>
    </section>
  );
}
