'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Evidence = {
  source: 'insurance' | 'depreciation';
  stageId: number;
  sheet: string | null;
  row: number | null;
  description: string | null;
  rationale: string | null;
};

type Candidate = {
  key: string;
  title: string;
  plate: string | null;
  serial: string | null;
  chassis: string | null;
  engine: string | null;
  modelYear: number | null;
  insuredUf: number | null;
  netBookValueClp: number | null;
  dualSource: boolean;
  readyForReview: boolean;
  reviewStatus: string | null;
  reviewBasis: string | null;
  reviewSourceCount: number | null;
  sourceCount: number;
  evidenceCount: number;
  evidence: Evidence[];
};

type Response = {
  summary: {
    candidates: number;
    dualSource: number;
    readyForReview: number;
    insuranceOnly: number;
    depreciationOnly: number;
  };
  candidates: Candidate[];
};

const fetcher=async(url:string):Promise<Response>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar candidatas');
  return payload;
};

const number=(value:number)=>new Intl.NumberFormat('es-CL').format(value);
const money=(value:number|null)=>value==null?'Sin base':new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(value);
const uf=(value:number|null)=>value==null?'Sin base':new Intl.NumberFormat('es-CL',{maximumFractionDigits:2}).format(value)+' UF';

export default function MissingAssetCandidatesPage(){
  const {data,error,isLoading}=useSWR<Response>('/api/finance/missing-asset-candidates',fetcher,{revalidateOnFocus:false});

  return <div className="mx-auto w-full max-w-[1500px] space-y-5 pb-10">
    <section>
      <Link href="/dashboard/finanzas/activos" className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4"/> Economía de activos
      </Link>
      <div className="mt-3">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-primary">Finanzas · Activos</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Candidatas Ficha 360</h1>
        <p className="mt-1 text-sm text-muted-foreground">Activos con evidencia financiera verificable que todavía no tienen contraparte canónica. Nada se crea automáticamente.</p>
      </div>
    </section>

    {isLoading ? <StatePanel tone="loading" title="Consolidando candidatas" /> : null}
    {error ? <StatePanel tone="error" title="No se pudo cargar candidatas" description={error.message} /> : null}

    {data ? <>
      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Candidatas" value={number(data.summary.candidates)} detail="Entidades deduplicadas" />
        <Metric label="Listas para revisión" value={number(data.summary.readyForReview)} detail="Identidad exacta en 2 fuentes" />
        <Metric label="Sólo seguro" value={number(data.summary.insuranceOnly)} detail="Identidad desde la póliza" />
        <Metric label="Sólo depreciación" value={number(data.summary.depreciationOnly)} detail="Identidad desde la fuente de Daniel" />
      </section>

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Prioridad de revisión</h2>
          <p className="mt-1 text-xs text-muted-foreground">Primero doble fuente; luego identificadores físicos explícitos. Crear la Ficha 360 sigue requiriendo revisión operacional.</p>
        </div>
        <div className="divide-y">
          {data.candidates.map((candidate)=>(
            <article key={candidate.key} className="px-4 py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_160px_160px_160px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{candidate.title}</p>
                    {candidate.readyForReview ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Lista para revisión</Badge> : candidate.dualSource ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Doble respaldo</Badge> : <Badge variant="outline">{candidate.evidence[0]?.source==='insurance'?'Seguro':'Depreciación'}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[candidate.plate?'PPU '+candidate.plate:null,candidate.serial?'Serie '+candidate.serial:null,candidate.chassis?'Chasis '+candidate.chassis:null,candidate.engine?'Motor '+candidate.engine:null,candidate.modelYear?'Año '+candidate.modelYear:null].filter(Boolean).join(' · ')||'Identificador desde evidencia fuente'}
                  </p>
                  {candidate.readyForReview ? <p className="mt-1 text-xs text-primary">Sin contraparte canónica exacta · preparada para revisión operacional</p> : null}
                </div>
                <Value label="Valor libro" value={money(candidate.netBookValueClp)} />
                <Value label="Seguro" value={uf(candidate.insuredUf)} />
                <Value label="Evidencias" value={number(candidate.evidenceCount)} />
              </div>
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver evidencia</summary>
                <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
                  {candidate.evidence.map((item)=>(
                    <div key={item.source+'-'+item.stageId} className="text-xs leading-5">
                      <span className="font-medium text-foreground">{item.source==='insurance'?'Seguro':'Depreciación'}</span>
                      <span className="text-muted-foreground"> · {item.sheet||'Sin hoja'} · fila {item.row??'—'}</span>
                      {item.description?<p className="text-muted-foreground">{item.description}</p>:null}
                      {item.rationale?<p className="text-muted-foreground">{item.rationale}</p>:null}
                    </div>
                  ))}
                </div>
              </details>
            </article>
          ))}
        </div>
      </section>
    </>:null}
  </div>;
}

function Metric({label,value,detail}:{label:string;value:string;detail:string}){
  return <div className="bg-card p-4"><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-2 text-2xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>;
}

function Value({label,value}:{label:string;value:string}){
  return <div><p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium tabular-nums">{value}</p></div>;
}
