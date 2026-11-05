'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, Building2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Facility = {
  key: string;
  label: string;
  scope: 'single_facility' | 'multi_unit_family' | string;
  representedBookValueClp: number;
  rowCount: number;
  review: null | {
    id: string;
    issueType: string;
    status: string;
    resolutionNote: string | null;
    evidenceReference: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  evidence: Array<{
    stageId: number;
    sheet: string | null;
    row: number | null;
    description: string | null;
    netBookValueClp: number | null;
    costCenterRaw: string | null;
  }>;
};

type Response = {
  source: null | {
    filename: string;
    cutoffDate: string | null;
  };
  summary: {
    groups: number;
    rows: number;
    singleFacility: number;
    multiUnitFamily: number;
    pendingReview: number;
    representedBookValueClp: number;
  };
  facilities: Facility[];
};

const fetcher = async (url: string): Promise<Response> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar instalaciones');
  return payload;
};

const number = (value: number) => new Intl.NumberFormat('es-CL').format(value);
const money = (value: number) => new Intl.NumberFormat('es-CL', {
  style: 'currency',
  currency: 'CLP',
  maximumFractionDigits: 0,
}).format(value);

export default function FacilityCandidatesPage() {
  const { data, error, isLoading } = useSWR<Response>('/api/finance/facility-candidates', fetcher, { revalidateOnFocus: false });

  return <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-10">
    <section>
      <Link href="/dashboard/finanzas/activos" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Economía de activos
      </Link>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas · Activos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Instalaciones por revisar</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Infraestructura identificada desde depreciación. Esta vista no crea ni fusiona Fichas 360.
        </p>
      </div>
    </section>

    {isLoading ? <StatePanel tone="loading" title="Preparando instalaciones" /> : null}
    {error ? <StatePanel tone="error" title="No se pudieron cargar instalaciones" description={error.message} /> : null}

    {data ? <>
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Instalaciones / familias" value={number(data.summary.groups)} detail={number(data.summary.rows) + ' líneas fuente agrupadas'} />
        <Metric label="Instalación 1:1" value={number(data.summary.singleFacility)} detail="Puede revisarse como una sola entidad física" />
        <Metric label="Requiere desagregar" value={number(data.summary.multiUnitFamily)} detail="Familias con varias unidades o líneas no separables" />
        <Metric label="Valor libro representado" value={money(data.summary.representedBookValueClp)} detail="Suma fuente; no es valor de mercado ni reposición" />
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-sm font-semibold">Cola de revisión</h2>
              <p className="mt-1 text-xs text-muted-foreground">
                Primero instalaciones individuales; las familias multiunidad deben desagregarse antes de cualquier alta.
              </p>
            </div>
            <Badge variant="outline">{number(data.summary.pendingReview)} pendientes</Badge>
          </div>
        </div>

        <div className="divide-y">
          {data.facilities.map((facility) => (
            <article key={facility.key} className="px-4 py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_160px_140px_160px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <p className="truncate text-sm font-medium">{facility.label}</p>
                    {facility.scope === 'multi_unit_family'
                      ? <Badge variant="outline">Requiere desagregar</Badge>
                      : <Badge variant="secondary">Instalación 1:1</Badge>}
                    {facility.review?.status && facility.review.status !== 'open'
                      ? <Badge variant="outline">{facility.review.status}</Badge>
                      : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {facility.scope === 'multi_unit_family'
                      ? 'No crear Ficha 360 hasta separar unidades con evidencia.'
                      : 'Candidata a revisión operacional; la fuente financiera por sí sola no autoriza el alta.'}
                  </p>
                  {facility.review?.resolutionNote
                    ? <p className="mt-1 text-xs text-muted-foreground">{facility.review.resolutionNote}</p>
                    : null}
                </div>
                <Value label="Valor libro" value={money(facility.representedBookValueClp)} />
                <Value label="Líneas fuente" value={number(facility.rowCount)} />
                <Value label="Estado" value={facility.review?.status === 'open' || !facility.review ? 'Revisar' : facility.review.status} />
              </div>

              <details className="mt-3 rounded-md border bg-muted/20">
                <summary className="cursor-pointer px-3 py-2 text-xs font-medium">Ver respaldo ({number(facility.evidence.length)})</summary>
                <div className="divide-y border-t">
                  {facility.evidence.map((item) => (
                    <div key={item.stageId} className="px-3 py-2 text-xs">
                      <p className="font-medium">{item.description || 'Línea sin descripción'}</p>
                      <p className="mt-0.5 text-muted-foreground">
                        {[item.sheet, item.row ? 'fila ' + item.row : null, item.netBookValueClp != null ? money(item.netBookValueClp) : null]
                          .filter(Boolean)
                          .join(' · ')}
                      </p>
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>
    </> : null}
  </div>;
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="bg-card px-4 py-4">
    <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">{label}</p>
    <p className="mt-1 text-xl font-semibold tracking-tight">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </div>;
}

function Value({ label, value }: { label: string; value: string }) {
  return <div>
    <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label}</p>
    <p className="mt-1 text-sm font-medium">{value}</p>
  </div>;
}
