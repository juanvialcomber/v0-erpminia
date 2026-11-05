'use client';

import useSWR from 'swr';

type Payload = {
  authorityTarget: 'SII_DIRECT';
  laudusRoleTarget: 'historical_reference_only';
  status: 'ready' | 'blocked';
  directSii: {
    configured: boolean;
    authenticated: boolean;
    importedInboundDtes: number;
    outboundDtes: number;
    evidenceCount: number;
  };
  laudus: {
    dtesObserved: number;
    incompleteParties: number;
    adequateAsFiscalAuthority: boolean;
  };
  blockers: string[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo calcular el reemplazo DTE.');
  return payload;
};

export function SiiLaudusReplacementCard() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/sii/replacement-readiness',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 900000 },
  );

  if (error) {
    return (
      <section className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-5 text-sm text-muted-foreground">
        No se pudo calcular el estado de reemplazo DTE. No se asume cobertura fiscal.
      </section>
    );
  }

  return (
    <section className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="text-sm font-semibold">Reemplazo DTE Laudus</p>
          <p className="mt-1 text-sm text-muted-foreground">
            La autoridad fiscal objetivo es SII directo. Laudus queda sólo como referencia histórica y no como fuente suficiente para cierre tributario.
          </p>
        </div>
        <span className="rounded-full border px-3 py-1 text-xs font-medium">
          {isLoading || !data ? 'Calculando' : data.status === 'ready' ? 'Listo para operar sin Laudus' : 'Pendiente'}
        </span>
      </div>

      {data ? (
        <>
          <div className="mt-5 grid gap-3 sm:grid-cols-4">
            <Metric label="DTE SII importados" value={data.directSii.importedInboundDtes} />
            <Metric label="DTE emitidos MOTIL" value={data.directSii.outboundDtes} />
            <Metric label="DTE Laudus observados" value={data.laudus.dtesObserved} />
            <Metric label="Laudus incompletos" value={data.laudus.incompleteParties} />
          </div>

          {data.blockers.length ? (
            <div className="mt-4 rounded-lg border p-4">
              <p className="text-sm font-medium">Pendientes para retirar Laudus de DTE</p>
              <div className="mt-2 space-y-1 text-sm text-muted-foreground">
                {data.blockers.map((blocker) => <p key={blocker}>• {blocker}</p>)}
              </div>
            </div>
          ) : (
            <p className="mt-4 rounded-lg border p-4 text-sm text-muted-foreground">
              La fuente fiscal directa tiene evidencia suficiente para dejar Laudus como referencia histórica.
            </p>
          )}
        </>
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{Number(value || 0).toLocaleString('es-CL')}</p>
    </div>
  );
}
