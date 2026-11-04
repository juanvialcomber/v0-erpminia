'use client';

import { useCallback, useEffect, useState } from 'react';
import { SiiLaudusReplacementCard } from '@/components/sii/sii-laudus-replacement-card';

type ReadinessCheck = {
  key: string;
  label: string;
  ready: boolean;
  detail: string;
  externalInput: boolean;
};

type SiiReadiness = {
  environment: string;
  readyForCertification: boolean;
  readyForProduction: boolean;
  waitingForExternalInputs: boolean;
  acceptedCertificationDtes: number;
  availableDte33Folios: number;
  checks: ReadinessCheck[];
  productionGate: {
    ready: boolean;
    detail: string;
  };
};

export default function SiiPreparationPage() {
  const [data, setData] = useState<SiiReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/sii/readiness', { cache: 'no-store' });
      const payload = (await response.json()) as SiiReadiness & { error?: string };
      if (!response.ok) throw new Error(payload.error || 'SII_READINESS_FAILED');
      setData(payload);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'No se pudo leer la preparación SII');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <main className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium text-muted-foreground">Administración · SII</p>
          <h1 className="text-3xl font-semibold tracking-tight">Preparación para activar</h1>
          <p className="mt-2 max-w-3xl text-muted-foreground">
            Estado técnico y tributario previo a emitir. Esta pantalla no firma, no reserva folios y no envía DTE.
          </p>
        </div>
        <button type="button" onClick={() => void load()} disabled={loading} className="inline-flex h-10 items-center justify-center rounded-md border px-4 text-sm font-medium disabled:opacity-50">
          {loading ? 'Actualizando…' : 'Actualizar estado'}
        </button>
      </div>

      {error ? (
        <div className="rounded-xl border border-red-500/30 bg-red-500/5 p-5 text-sm">
          <p className="font-semibold">No se pudo calcular el estado</p>
          <p className="mt-1 text-muted-foreground">{error}</p>
        </div>
      ) : null}

      {data ? (
        <>
          <section className="grid gap-4 md:grid-cols-3">
            <SummaryCard label="Certificación" value={data.readyForCertification ? 'Lista' : 'Pendiente'} ok={data.readyForCertification} />
            <SummaryCard label="Producción" value={data.readyForProduction ? 'Lista' : 'Bloqueada'} ok={data.readyForProduction} />
            <SummaryCard label="Estado actual" value={data.waitingForExternalInputs ? 'Esperando datos reales' : 'Sin insumos externos pendientes'} ok={!data.waitingForExternalInputs} neutral={data.waitingForExternalInputs} />
          </section>

          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm font-semibold">Checklist de activación</p>
                <p className="mt-1 text-sm text-muted-foreground">Ambiente configurado: {data.environment === 'production' ? 'PRODUCCIÓN' : 'CERTIFICACIÓN'}.</p>
              </div>
              <span className="rounded-full border px-3 py-1 text-xs font-medium">DTE 33</span>
            </div>

            <div className="mt-5 divide-y rounded-lg border">
              {data.checks.map((check) => (
                <div key={check.key} className="flex gap-3 p-4">
                  <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full ${check.ready ? 'bg-emerald-500' : check.externalInput ? 'bg-amber-500' : 'bg-slate-400'}`} />
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-medium">{check.label}</p>
                      {!check.ready && check.externalInput ? <span className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground">requiere dato real</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">{check.detail}</p>
                  </div>
                </div>
              ))}
            </div>
          </section>

          <section className="rounded-xl border bg-card p-6 shadow-sm">
            <p className="text-sm font-semibold">Gate de producción</p>
            <div className="mt-4 flex gap-3 rounded-lg border p-4">
              <span aria-hidden className={`mt-1 h-3 w-3 shrink-0 rounded-full ${data.productionGate.ready ? 'bg-emerald-500' : 'bg-amber-500'}`} />
              <div>
                <p className="font-medium">Certificación real antes de producción</p>
                <p className="mt-1 text-sm text-muted-foreground">{data.productionGate.detail}</p>
              </div>
            </div>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <Metric label="Folios DTE 33 disponibles" value={String(data.availableDte33Folios)} />
              <Metric label="DTE 33 aceptados en certificación" value={String(data.acceptedCertificationDtes)} />
            </div>
          </section>

          <SiiLaudusReplacementCard />

          <section className="rounded-xl border border-dashed p-5 text-sm">
            <p className="font-semibold">Qué puedes dejar para después</p>
            <p className="mt-1 text-muted-foreground">
              Usuarios adicionales, RUT del firmante, certificado y CAF pueden incorporarse cuando estén disponibles. El motor queda desplegado; no se usan datos ficticios para simular habilitación fiscal.
            </p>
          </section>
        </>
      ) : loading ? (
        <div className="rounded-xl border p-6 text-sm text-muted-foreground">Calculando preparación…</div>
      ) : null}
    </main>
  );
}

function SummaryCard({ label, value, ok, neutral = false }: { label: string; value: string; ok: boolean; neutral?: boolean }) {
  return (
    <div className="rounded-xl border bg-card p-5 shadow-sm">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <span aria-hidden className={`h-2.5 w-2.5 rounded-full ${neutral ? 'bg-amber-500' : ok ? 'bg-emerald-500' : 'bg-slate-400'}`} />
        <p className="font-semibold">{value}</p>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}
