'use client';

import useSWR from 'swr';
import { useState } from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar inteligencia de condición.');
  return payload;
};

function numeric(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function pct(value: unknown) {
  const n = numeric(value);
  return n === null ? 'N/D' : new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 0 }).format(n);
}

function decimal(value: unknown, suffix = '') {
  const n = numeric(value);
  return n === null ? 'N/D' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 }).format(n) + suffix;
}

function evidenceLabel(band: string) {
  if (band === 'high') return 'Alta';
  if (band === 'medium') return 'Media';
  return 'Baja';
}

export function MaintenanceConditionIntelligence({ shared }: { shared?: { data: any; error: any; isLoading: boolean; mutate: () => Promise<any> } }) {
  const own = useSWR(shared ? null : '/api/maintenance/condition-intelligence', fetcher, { revalidateOnFocus: false });
  const data = shared?.data ?? own.data;
  const error = shared?.error ?? own.error;
  const isLoading = shared?.isLoading ?? own.isLoading;
  const mutate = shared?.mutate ?? own.mutate;
  const [saving, setSaving] = useState<string | null>(null);
  const [message, setMessage] = useState('');

  async function review(signal: any, decision: 'confirmed' | 'dismissed' | 'monitor') {
    setSaving(signal.signalKey + decision);
    setMessage('');
    try {
      const response = await fetch('/api/maintenance/condition-intelligence/review', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          signalKey: signal.signalKey,
          assetId: signal.assetId,
          signalType: signal.signalType,
          decision,
          evidenceSnapshot: {
            metric: signal.metric,
            baseline: signal.baseline,
            changeRatio: signal.changeRatio,
            robustZ: signal.robustZ,
            evidenceScore: signal.evidenceScore,
            latestAt: signal.latestAt,
          },
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la revisión.');
      setMessage('Revisión guardada. No se modificó el estado del equipo ni se creó una OT.');
      await mutate();
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : 'No se pudo guardar la revisión.');
    } finally {
      setSaving(null);
    }
  }

  const summary = data?.summary;
  const signals = (data?.signals || []).filter((row:any) => !row.review || row.review.decision === 'monitor');
  const equipment = (data?.equipment || []).filter((row:any) => row.runtimeReadings > 0 || row.usageEvents > 0 || row.wasteEvents > 0 || row.fluidPlans > 0);

  return (
    <section className="space-y-4 border-t pt-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-primary">Condición</p>
        <h3 className="mt-1 text-base font-semibold">Evidencia antes de alertar</h3>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">MOTIL aprende el comportamiento del propio equipo sólo cuando existe historia suficiente. Una señal pide revisión; no diagnostica una falla ni crea una OT.</p>
      </div>

      {isLoading ? <p className="text-sm text-muted-foreground">Evaluando cobertura…</p> : null}
      {error ? <p className="text-sm text-destructive">{error.message}</p> : null}
      {message ? <p className="text-sm text-muted-foreground" role="status">{message}</p> : null}

      {!isLoading && !error ? (
        <>
          <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-5">
            {[
              ['Con evidencia', summary?.assetsWithEvidence || 0],
              ['Evidencia alta', summary?.highEvidence || 0],
              ['Evidencia media', summary?.mediumEvidence || 0],
              ['Evidencia baja', summary?.lowEvidence || 0],
              ['Por revisar', summary?.reviewSignals || 0],
            ].map(([label,value]) => (
              <div key={String(label)} className="bg-card p-3">
                <p className="text-xs text-muted-foreground">{label}</p>
                <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
              </div>
            ))}
          </div>

          <p className="text-xs text-muted-foreground">Sin base suficiente: {summary?.noEvidence || 0} de {summary?.assets || 0} activos. No se clasifican como evidencia baja.</p>

          {signals.length === 0 ? (
            <div className="rounded-lg border p-4">
              <p className="text-sm font-medium">Sin señales con evidencia suficiente</p>
              <p className="mt-1 text-xs text-muted-foreground">Esto no significa que los equipos estén sanos. Significa que MOTIL todavía no tiene historia suficiente o no detectó una desviación robusta en los datos disponibles.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {signals.map((signal:any) => (
                <div key={signal.signalKey} className="rounded-lg border p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                    <div>
                      <div className="flex flex-wrap gap-2">
                        <Badge variant={signal.severity === 'high' ? 'destructive' : 'outline'}>{signal.severity === 'high' ? 'Prioridad alta' : 'Revisar'}</Badge>
                        <Badge variant="outline">Evidencia {evidenceLabel(signal.evidenceScore?.band)}</Badge>
                      </div>
                      <p className="mt-2 font-medium">{signal.assetCode ? signal.assetCode + ' · ' : ''}{signal.assetName || 'Equipo'}</p>
                      <p className="mt-1 text-sm">{signal.explanation}</p>
                      <p className="mt-1 text-xs text-muted-foreground">Actual {decimal(signal.metric,' L/h')} · base {decimal(signal.baseline,' L/h')} · cambio {pct(signal.changeRatio)}</p>
                      <p className="mt-2 text-xs text-muted-foreground">{signal.nextAction}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button size="sm" variant="outline" disabled={Boolean(saving)} onClick={() => void review(signal,'monitor')}>Seguir mirando</Button>
                      <Button size="sm" variant="outline" disabled={Boolean(saving)} onClick={() => void review(signal,'dismissed')}>Descartar</Button>
                      <Button size="sm" disabled={Boolean(saving)} onClick={() => void review(signal,'confirmed')}>Confirmar señal</Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {equipment.length > 0 ? (
            <details className="rounded-lg border p-4 text-sm">
              <summary className="cursor-pointer font-medium">Cobertura por equipo</summary>
              <div className="mt-3 divide-y">
                {equipment.slice(0,20).map((row:any) => (
                  <div key={row.assetId} className="grid gap-2 py-3 md:grid-cols-[1.5fr_0.7fr_0.7fr_0.7fr_0.7fr]">
                    <div><p className="font-medium">{row.assetCode ? row.assetCode + ' · ' : ''}{row.assetName || 'Equipo'}</p><p className="text-xs text-muted-foreground">Evidence Score {row.evidence.total}/100 · {evidenceLabel(row.evidence.band)}</p></div>
                    <div><p className="text-xs text-muted-foreground">Horómetros</p><p>{row.runtimeReadings}</p></div>
                    <div><p className="text-xs text-muted-foreground">Fluidos</p><p>{row.usageEvents}</p></div>
                    <div><p className="text-xs text-muted-foreground">Residuos</p><p>{row.wasteEvents}</p></div>
                    <div><p className="text-xs text-muted-foreground">Planes</p><p>{row.fluidPlans}</p></div>
                  </div>
                ))}
              </div>
            </details>
          ) : null}

          <details className="text-xs text-muted-foreground">
            <summary className="cursor-pointer">Cómo decide MOTIL</summary>
            <div className="mt-2 space-y-1">
              <p>Evidence Score mide preparación de evidencia, no salud mecánica.</p>
              <p>Una anomalía requiere al menos cuatro intervalos válidos de consumo/hora del mismo equipo.</p>
              <p>El baseline usa mediana y MAD para reducir sensibilidad a valores extremos.</p>
              <p>La revisión humana queda registrada y nunca cambia por sí sola el estado canónico del activo.</p>
            </div>
          </details>
        </>
      ) : null}
    </section>
  );
}
