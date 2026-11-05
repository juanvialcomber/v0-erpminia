'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, CircleAlert, Database, Link2, ScanSearch, type LucideIcon } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type SourceRow = {
  external_id: string;
  name: string | null;
  acquisition_date: string | null;
  retirement_date: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  location: string | null;
};

type ReviewRow = SourceRow & {
  reviewTier: { key: string; label: string; rank: number };
};

type MatchedRow = SourceRow & {
  canonical_asset_id: string;
  canonicalAsset: null | {
    id: string;
    asset_code: string | null;
    name: string | null;
    operational_status: string | null;
    criticality: string | null;
  };
};

type Response = {
  source: { name: string; readOnly: boolean; syncedAt: string | null };
  summary: {
    totalRows: number;
    matched: number;
    pending: number;
    conflict: number;
    ignored: number;
    activePending: number;
    activePendingWithSerial: number;
    activePendingWithModel: number;
    retiredPending: number;
    acquisitionCostAvailable: number;
  };
  reviewRows: ReviewRow[];
  matchedRows: MatchedRow[];
  semantics: Record<string,string>;
};

const fetcher=async(url:string):Promise<Response>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar activos fijos Laudus');
  return payload;
};

const number=(value:number)=>new Intl.NumberFormat('es-CL').format(value);

function detail(row: ReviewRow) {
  const identity=[row.manufacturer,row.model,row.serial_number ? 'Serie '+row.serial_number : null].filter(Boolean).join(' · ');
  const source=[row.supplier_name,row.invoice_number ? 'Factura '+row.invoice_number : null,row.acquisition_date ? 'Alta '+row.acquisition_date : null].filter(Boolean).join(' · ');
  return { identity, source };
}

export function LaudusFixedAssetsReview(){
  const {data,error,isLoading}=useSWR<Response>('/api/finance/laudus-fixed-assets-review',fetcher,{revalidateOnFocus:false});

  if(isLoading) return <StatePanel tone="loading" title="Preparando activos fijos Laudus" description="Conciliando identidad sin modificar la fuente." />;
  if(error) return <StatePanel tone="error" title="No se pudo cargar activos fijos Laudus" description={error.message} />;
  if(!data) return null;

  return <section className="overflow-hidden rounded-lg border bg-card">
    <div className="flex flex-col gap-2 border-b px-4 py-4 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Laudus · sólo lectura</p>
        <h2 className="mt-1 font-semibold">Activos fijos observados</h2>
        <p className="mt-1 max-w-3xl text-xs leading-5 text-muted-foreground">
          Prioriza identidad operacional. Un registro Laudus no se transforma en Ficha 360 sin evidencia verificable.
        </p>
      </div>
      <Badge variant="outline">{number(data.summary.totalRows)} registros fuente</Badge>
    </div>

    <div className="grid gap-px border-b bg-border sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Link2} label="Vinculados" value={number(data.summary.matched)} detail="Con contraparte canónica verificada" />
      <Metric icon={ScanSearch} label="Pendientes sin retiro" value={number(data.summary.activePending)} detail={number(data.summary.activePendingWithSerial)+' con serie · '+number(data.summary.activePendingWithModel)+' con marca/modelo'} />
      <Metric icon={CircleAlert} label="Conflictos" value={number(data.summary.conflict)} detail="Requieren decisión humana; no se sobreescriben" />
      <Metric icon={Database} label="Pendientes históricos" value={number(data.summary.retiredPending)} detail="Con retiro informado en la fuente" />
    </div>

    {data.summary.acquisitionCostAvailable===0 ? (
      <div className="border-b bg-muted/20 px-4 py-3 text-xs leading-5 text-muted-foreground">
        <strong className="font-medium text-foreground">Costo:</strong> {data.semantics.cost}
      </div>
    ) : null}

    {data.reviewRows.length ? (
      <div>
        <div className="flex items-center justify-between px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">Prioridad de conciliación</h3>
            <p className="mt-1 text-xs text-muted-foreground">Primero serie física; después marca/modelo; finalmente referencia documental.</p>
          </div>
          <Badge variant="secondary">{number(data.summary.activePending)} sin retiro por revisar</Badge>
        </div>
        <div className="divide-y border-t">
          {data.reviewRows.slice(0,12).map((row)=>{
            const info=detail(row);
            return <div key={row.external_id} className="grid gap-2 px-4 py-3 lg:grid-cols-[minmax(0,1.5fr)_150px_minmax(0,1fr)] lg:items-center">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name||'Activo fijo sin nombre'}</p>
                <p className="mt-1 truncate text-xs text-muted-foreground">{info.source||'Sin referencia documental adicional'}</p>
              </div>
              <Badge variant={row.reviewTier.key==='physical_identifier'?'secondary':'outline'}>{row.reviewTier.label}</Badge>
              <p className="truncate text-xs text-muted-foreground lg:text-right">{info.identity||'Falta identificador operacional'}</p>
            </div>;
          })}
        </div>
      </div>
    ) : null}

    {data.matchedRows.length ? (
      <details className="border-t">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">Ver activos Laudus ya vinculados</summary>
        <div className="divide-y border-t">
          {data.matchedRows.slice(0,12).map((row)=>(
            <div key={row.external_id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">{row.name||'Activo Laudus'}</p>
                <p className="mt-1 text-xs text-muted-foreground">{row.canonicalAsset?.asset_code||'Sin código'} · {row.canonicalAsset?.name||'Ficha 360 vinculada'}</p>
              </div>
              <Link href={'/dashboard/mantenimiento/equipos/'+encodeURIComponent(row.canonical_asset_id)+'/ficha'} className="inline-flex items-center gap-2 text-xs font-medium hover:text-primary">
                Abrir Ficha 360 <ArrowRight className="h-3.5 w-3.5"/>
              </Link>
            </div>
          ))}
        </div>
      </details>
    ) : null}
  </section>;
}

function Metric({icon:Icon,label,value,detail}:{icon:LucideIcon;label:string;value:string;detail:string}){
  return <div className="bg-card p-4">
    <div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4"/>{label}</div>
    <p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p>
    <p className="mt-1 text-xs text-muted-foreground">{detail}</p>
  </div>;
}
