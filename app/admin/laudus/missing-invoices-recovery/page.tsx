'use client';

import { useEffect, useState } from 'react';

type RecoveryResponse = {
  ok?: boolean;
  generatedAt?: string;
  result?: {
    estado?: string;
    candidatos?: number;
    recuperadas?: number;
    errores?: number;
    apiCalls?: number;
    presupuestoRestante?: number;
    porClase?: Record<string, number>;
  };
  error?: string;
};

export default function LaudusMissingInvoicesRecoveryPage() {
  const [data, setData] = useState<RecoveryResponse | null>(null);
  const [running, setRunning] = useState(true);

  useEffect(() => {
    let active = true;

    fetch('/api/integrations/laudus/missing-invoices-recovery', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({}),
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload?.error || 'No fue posible ejecutar la recuperación.');
        return payload as RecoveryResponse;
      })
      .then((payload) => {
        if (active) setData(payload);
      })
      .catch((error) => {
        if (active) setData({ error: error instanceof Error ? error.message : 'Error inesperado.' });
      })
      .finally(() => {
        if (active) setRunning(false);
      });

    return () => {
      active = false;
    };
  }, []);

  return (
    <main className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Recuperación de facturas Laudus</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Recupera un lote acotado de facturas fuente faltantes sin modificar Laudus ni datos canónicos MOTIL.
      </p>

      <section className="mt-6 rounded-lg border p-4">
        {running ? (
          <p>Ejecutando lote controlado…</p>
        ) : data?.error ? (
          <p className="text-red-600">{data.error}</p>
        ) : (
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <dt>Estado</dt><dd>{data?.result?.estado || 'sin dato'}</dd>
            <dt>Candidatos</dt><dd>{data?.result?.candidatos ?? 0}</dd>
            <dt>Recuperadas</dt><dd>{data?.result?.recuperadas ?? 0}</dd>
            <dt>Errores</dt><dd>{data?.result?.errores ?? 0}</dd>
            <dt>Llamadas API</dt><dd>{data?.result?.apiCalls ?? 0}</dd>
            <dt>Presupuesto restante</dt><dd>{data?.result?.presupuestoRestante ?? 0}</dd>
          </dl>
        )}
      </section>
    </main>
  );
}
