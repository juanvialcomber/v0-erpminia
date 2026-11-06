'use client';

import useSWR from 'swr';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Property = {
  id: string;
  representative_name: string;
  property_name: string;
  patent_value_clp: number | null;
  source_file: string;
  source_sheet: string;
  totals: { royalty_clp: number; net_clp: number; tonnes: number; entries: number; paid_entries: number };
};

type Royalty = {
  id: string;
  mining_property_id: string;
  lot_ref: string | null;
  event_date: string | null;
  tonnes: number | null;
  cu_grade_pct: number | null;
  net_clp: number | null;
  royalty_clp: number | null;
  payment_status: 'paid' | 'unpaid' | 'partial' | 'unknown';
  payment_note: string | null;
  destination: string | null;
  notes: string | null;
  source_row: number;
};

type Response = {
  properties: Property[];
  royalties: Royalty[];
  contracts: unknown[];
  summary: {
    total_contracts: number;
    properties: number;
    royalty_entries: number;
    royalties_clp: number;
    net_clp: number;
    tonnes: number;
    unpaid_entries: number;
    partial_entries: number;
  };
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar propiedad minera');
  return payload;
};

function clp(value: number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);
}

function number(value: number | null | undefined, digits = 1) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('es-CL', { maximumFractionDigits: digits }).format(value);
}

function paymentLabel(value: Royalty['payment_status']) {
  if (value === 'paid') return 'Pagada';
  if (value === 'unpaid') return 'No pagada';
  if (value === 'partial') return 'Parcial';
  return 'Por revisar';
}

export default function MiningPropertyPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/legal/mining-property', fetcher, { revalidateOnFocus: false });

  if (isLoading) return <StatePanel tone="loading" title="Cargando propiedad minera" description="Leyendo propiedades, lotes y regalías canónicas." />;
  if (error || !data) return <StatePanel tone="error" title="Propiedad minera no disponible" description="No se reemplazan datos faltantes por supuestos." />;

  const propertyById = new Map(data.properties.map((property) => [property.id, property]));

  return (
    <div className="space-y-5">
      <header className="border-b border-border/70 pb-4">
        <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Propiedad minera</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Propiedad minera</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Propiedades, lotes, regalías y pagos reconstruidos desde evidencia operacional. El Excel original se conserva como fuente.
        </p>
      </header>

      <section className="grid overflow-hidden rounded-md border sm:grid-cols-5">
        {[
          ['Propiedades', data.summary.properties],
          ['Movimientos', data.summary.royalty_entries],
          ['Toneladas', number(data.summary.tonnes)],
          ['Regalías', clp(data.summary.royalties_clp)],
          ['Pendientes', data.summary.unpaid_entries + data.summary.partial_entries],
        ].map(([label, value], index) => (
          <div key={String(label)} className={`px-4 py-3 ${index ? 'border-t sm:border-l sm:border-t-0' : ''}`}>
            <p className="text-[11px] uppercase tracking-[0.08em] text-muted-foreground">{label}</p>
            <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
          </div>
        ))}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Propiedades canónicas</h2>
          <p className="text-sm text-muted-foreground">Una fila por propiedad y representante; los totales provienen de movimientos trazables.</p>
        </div>
        <div className="divide-y overflow-hidden rounded-md border">
          {data.properties.length ? data.properties.map((property) => (
            <article key={property.id} className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div>
                  <h3 className="text-sm font-semibold">{property.property_name}</h3>
                  <p className="mt-1 text-xs text-muted-foreground">{property.representative_name}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Fuente: {property.source_file} · {property.source_sheet}</p>
                </div>
                <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-muted-foreground md:text-right">
                  <span>Patente</span><strong className="text-foreground">{clp(property.patent_value_clp)}</strong>
                  <span>Regalías</span><strong className="text-foreground">{clp(property.totals.royalty_clp)}</strong>
                  <span>Movimientos</span><strong className="text-foreground">{property.totals.entries}</strong>
                </div>
              </div>
            </article>
          )) : <p className="p-4 text-sm text-muted-foreground">No hay propiedades canónicas importadas.</p>}
        </div>
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="text-base font-semibold">Movimientos y regalías</h2>
          <p className="text-sm text-muted-foreground">Lotes, ajustes y pagos conservan fila de origen; un ajuste sin fecha no se convierte en lote ficticio.</p>
        </div>
        <div className="divide-y overflow-hidden rounded-md border">
          {data.royalties.slice(0, 100).map((item) => {
            const property = propertyById.get(item.mining_property_id);
            return (
              <article key={item.id} className="grid gap-2 p-3 text-sm md:grid-cols-[1.4fr_100px_100px_120px_120px] md:items-center">
                <div className="min-w-0">
                  <p className="truncate font-medium">{property?.property_name || 'Propiedad por resolver'} · {item.lot_ref || 'Ajuste'}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {[item.event_date || 'Sin fecha', item.destination, item.notes].filter(Boolean).join(' · ')}
                  </p>
                </div>
                <span className="text-xs text-muted-foreground">{number(item.tonnes, 3)} t</span>
                <span className="text-xs text-muted-foreground">{item.cu_grade_pct === null ? '—' : `${number(item.cu_grade_pct, 3)}% CuS`}</span>
                <span className="text-xs font-medium">{clp(item.royalty_clp)}</span>
                <Badge variant={item.payment_status === 'unpaid' ? 'destructive' : item.payment_status === 'partial' ? 'secondary' : 'outline'}>
                  {paymentLabel(item.payment_status)}
                </Badge>
              </article>
            );
          })}
          {!data.royalties.length ? <p className="p-4 text-sm text-muted-foreground">No hay movimientos de regalías importados.</p> : null}
        </div>
      </section>
    </div>
  );
}
