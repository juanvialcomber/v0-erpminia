'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, Bot, Send } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { StatePanel } from '@/components/ui/state-panel';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';

type PlanCandidate = {
  canonicalAssetId?: string | null;
  assetCode?: string | null;
  assetName?: string | null;
  priority?: string | null;
  recommendedAction?: string | null;
  workType?: string | null;
  suggestedName?: string | null;
  estimatedDurationHours?: number | null;
  reason?: string | null;
  evidenceReference?: string | null;
  sourceWorkOrderNumber?: string | null;
  sourceWorkOrderTitle?: string | null;
  materials?: Array<{
    productCode: string;
    productName?: string | null;
    unit?: string | null;
    quantityRequired: number;
    sourceStatus?: string | null;
  }>;
  materialSemantics?: string | null;
};

type AssistantResponse = {
  answer?: string;
  generatedAt?: string;
  coverage?: {
    source_rows: number;
    reconciled: number;
    pending_reconciliation: number;
    reconciled_percent: number;
    failed_sources: Array<{ source: string; error: string }>;
  };
  planCandidates?: PlanCandidate[];
  error?: string;
};

const QUICK = [
  '¿Qué debo atender hoy?',
  '¿Qué equipos P1 o P2 debo programar primero?',
  'Proponme hasta 3 planes estándar que valga la pena preparar esta semana, usando sólo evidencia real de planificación e historial de OT.',
  '¿Qué bloqueos de materiales o compras afectan mantenimiento?',
];

export default function PlanningAssistantPage() {
  const [message, setMessage] = useState('');
  const [answer, setAnswer] = useState('');
  const [coverage, setCoverage] = useState<AssistantResponse['coverage']>();
  const [planCandidates, setPlanCandidates] = useState<PlanCandidate[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function ask(question = message) {
    const value = question.trim();
    if (!value || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const response = await apiFetch('/api/planificacion/asistente', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: value }),
      });
      const payload = await response.json().catch(() => null) as AssistantResponse | null;
      if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar el asistente');
      setAnswer(payload?.answer || 'Sin respuesta utilizable.');
      setCoverage(payload?.coverage);
      setPlanCandidates(payload?.planCandidates || []);
      setMessage('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo consultar el asistente');
    } finally {
      setLoading(false);
    }
  }

  return <main className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Planning Intelligence · Ariel López</PageHeaderEyebrow>
        <PageHeaderTitle>Asistente de planificación</PageHeaderTitle>
        <PageHeaderDescription>Copiloto transversal con datos reales de Mantenimiento, Producción, Bodega y Compras. Recomienda qué revisar, programar y convertir en plan estándar; Ariel mantiene la decisión final.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button variant="outline" asChild><Link href="/dashboard/planificacion"><ArrowLeft className="h-4 w-4"/>Planificación</Link></Button>
      </PageHeaderActions>
    </PageHeader>

    <section className="grid gap-6 xl:grid-cols-[minmax(0,1.45fr)_minmax(280px,.55fr)]">
      <div className="space-y-4">
        <div className="rounded-lg border border-border bg-card p-5">
          <div className="flex items-center gap-2"><Bot className="h-4 w-4 text-primary"/><h2 className="text-lg font-semibold">Pregunta operacional</h2></div>
          <p className="mt-1 text-sm text-muted-foreground">El asistente consulta fuentes actuales en cada pregunta. No usa el Excel como maestro paralelo ni ejecuta cambios.</p>
          <form className="mt-4 flex flex-col gap-2 sm:flex-row" onSubmit={(event) => { event.preventDefault(); void ask(); }}>
            <Input value={message} onChange={(event) => setMessage(event.target.value)} placeholder="Ej.: ¿qué debo programar esta semana?" aria-label="Consulta para el asistente de planificación" />
            <Button type="submit" disabled={!message.trim() || loading}><Send className="h-4 w-4"/>{loading ? 'Analizando…' : 'Consultar'}</Button>
          </form>
        </div>

        {error ? <StatePanel tone="error" title="No se pudo responder" description={error} className="min-h-0" /> : null}
        {loading ? <StatePanel tone="loading" title="Construyendo recomendación" description="Revalidando prioridades, preventivos, atención transversal, inventario, compras y producción." className="min-h-0" /> : null}
        {!loading && answer ? <section className="rounded-lg border border-border bg-card p-5" aria-live="polite"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Respuesta</p><div className="mt-3 whitespace-pre-wrap text-sm leading-6 text-foreground">{answer}</div></section> : null}
        {!loading && planCandidates.length > 0 ? <section className="rounded-lg border border-border bg-card p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Candidatos con evidencia real</p>
          <div className="mt-3 space-y-3">
            {planCandidates.map((candidate) => {
              const params = new URLSearchParams({
                new: '1',
                assetCode: candidate.assetCode || '',
                assetName: candidate.assetName || '',
                name: candidate.suggestedName || '',
                workType: candidate.workType || 'preventivo',
                durationHours: candidate.estimatedDurationHours == null ? '' : String(candidate.estimatedDurationHours),
                reason: candidate.reason || '',
                evidence: candidate.evidenceReference || '',
                materials: JSON.stringify(candidate.materials || []),
              });
              return <div key={`${candidate.assetCode}-${candidate.sourceWorkOrderNumber}`} className="rounded-md border p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium">{candidate.suggestedName}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{candidate.priority} · {candidate.recommendedAction}</p>
                    <p className="mt-2 text-sm">{candidate.evidenceReference}</p>
                    {(candidate.materials || []).length > 0 ? <p className="mt-1 text-xs text-muted-foreground">
                      {(candidate.materials || []).length} material(es) canónicos observados en la OT fuente.
                    </p> : null}
                    <p className="mt-1 text-xs text-muted-foreground">La duración y los materiales son evidencia observada, no una promesa de tiempo ni consumo futuro.</p>
                  </div>
                  <Button asChild size="sm" className="shrink-0">
                    <Link href={`/dashboard/mantenimiento/planes-estandar?${params.toString()}`}>Preparar plan</Link>
                  </Button>
                </div>
              </div>;
            })}
          </div>
        </section> : null}
        {!loading && !answer && !error ? <StatePanel tone="neutral" title="Listo para planificar" description="Pregunta por prioridades, vencimientos, datos pendientes o dependencias operacionales." className="min-h-0" /> : null}
      </div>

      <aside className="space-y-4">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Consultas rápidas</h2>
          <div className="mt-3 space-y-2">{QUICK.map((item) => <Button key={item} variant="outline" className="h-auto w-full justify-start whitespace-normal py-2 text-left" onClick={() => void ask(item)} disabled={loading}>{item}</Button>)}</div>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Planes estándar</h2>
          <p className="mt-2 text-sm text-muted-foreground">Cuando una propuesta tenga sentido, Ariel puede abrir el registro de planes, completar los datos faltantes y aprobarla antes de usarla.</p>
          <Button variant="outline" className="mt-3 w-full" asChild>
            <Link href="/dashboard/mantenimiento/planes-estandar">Abrir planes estándar</Link>
          </Button>
        </section>
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="text-sm font-semibold">Calidad de datos</h2>
          {coverage ? <div className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Reconciliación</span><strong>{coverage.reconciled_percent}%</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Equipos enlazados</span><strong>{coverage.reconciled}/{coverage.source_rows}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Pendientes</span><strong>{coverage.pending_reconciliation}</strong></div>
            <div className="flex justify-between gap-4"><span className="text-muted-foreground">Fuentes con error</span><strong>{coverage.failed_sources.length}</strong></div>
            {coverage.pending_reconciliation > 0 ? <Button variant="outline" className="mt-2 w-full" asChild><Link href="/dashboard/planificacion/datos">Revisar Data de Ariel</Link></Button> : null}
          </div> : <p className="mt-2 text-sm text-muted-foreground">La cobertura se muestra después de la primera consulta para no presentar cifras cacheadas.</p>}
        </section>
      </aside>
    </section>
  </main>;
}
