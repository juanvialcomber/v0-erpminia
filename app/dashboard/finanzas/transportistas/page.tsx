'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Settlement = {
  id: string;
  supplier_id: string | null;
  carrier_name: string;
  carrier_rut: string | null;
  period_start: string;
  period_end: string;
  settlement_type: string;
  gross_payable_clp: number | null;
  loans_clp: number | null;
  advance_clp: number | null;
  net_payable_clp: number | null;
  fuel_liters: number | null;
  source_sheet: string;
  supplier: { id: string; name: string; rut: string | null } | null;
};

type Response = {
  items: Settlement[];
  periods: string[];
  summary: {
    settlements: number;
    linked_suppliers: number;
    unlinked_suppliers: number;
    net_payable_clp: number;
    gross_payable_clp: number;
    loans_clp: number;
    advances_clp: number;
    fuel_liters: number;
  };
  readOnly: boolean;
  semantics: string;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar liquidaciones');
  return payload as Response;
};

function clp(value: number | null | undefined) {
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
}

function qty(value: number | null | undefined) {
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value || 0));
}

export default function TransportSettlementsPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/transport-settlements', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando transportistas" description="Reconstruyendo liquidaciones desde evidencia histórica." />;
  if (error || !data) return <StatePanel tone="error" title="Liquidaciones no disponibles" description="La fuente histórica no se reemplaza por valores inferidos." />;

  const latestPeriod = data.periods[0] || null;
  const latestRows = latestPeriod ? data.items.filter((item) => item.period_start.startsWith(latestPeriod)) : data.items.slice(0, 20);

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Finanzas · Transportistas</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Transportistas</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Liquidaciones históricas reconstruidas por período y transportista. La planilla original permanece como evidencia y este ledger no autoriza pagos.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-5">
        {[
          ['Liquidaciones', data.summary.settlements],
          ['Vinculadas', data.summary.linked_suppliers],
          ['Sin RUT canónico', data.summary.unlinked_suppliers],
          ['Líquido histórico', clp(data.summary.net_payable_clp)],
          ['Petróleo', `${qty(data.summary.fuel_liters)} L`],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="rounded-md border bg-muted/20 px-4 py-3">
        <p className="text-sm font-medium">Fuente histórica</p>
        <p className="mt-1 text-xs text-muted-foreground">{data.semantics}</p>
      </section>

      <section className="space-y-3">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-base font-semibold">Último período</h2>
            <p className="text-sm text-muted-foreground">{latestPeriod || 'Sin período disponible'}</p>
          </div>
          <p className="text-xs text-muted-foreground">{data.periods.length} períodos mensuales disponibles</p>
        </div>

        <div className="divide-y overflow-hidden rounded-md border">
          {latestRows.length ? latestRows.map((item) => (
            <article key={item.id} className="grid gap-3 p-3 md:grid-cols-[1.5fr_120px_120px_120px_110px] md:items-center">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">{item.carrier_name}</p>
                  {item.supplier ? <Badge variant="outline">Conciliado</Badge> : <Badge variant="secondary">Por conciliar</Badge>}
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  {[item.carrier_rut || 'Sin RUT en fuente', item.source_sheet].join(' · ')}
                </p>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground">Petróleo</p>
                <p className="mt-1 font-medium tabular-nums">{qty(item.fuel_liters)} L</p>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground">Préstamos</p>
                <p className="mt-1 font-medium tabular-nums">{clp(item.loans_clp)}</p>
              </div>
              <div className="text-xs">
                <p className="text-muted-foreground">Anticipo</p>
                <p className="mt-1 font-medium tabular-nums">{clp(item.advance_clp)}</p>
              </div>
              <div className="text-xs md:text-right">
                <p className="text-muted-foreground">Líquido</p>
                <p className="mt-1 font-semibold tabular-nums">{clp(item.net_payable_clp)}</p>
              </div>
            </article>
          )) : <p className="p-4 text-sm text-muted-foreground">No hay liquidaciones en la fuente canónica.</p>}
        </div>
      </section>
    </div>
  );
}
