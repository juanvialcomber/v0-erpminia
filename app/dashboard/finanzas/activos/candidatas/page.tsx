'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import { ArrowLeft, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';
import { Button } from '@/components/ui/button';

type Evidence = {
  source: 'insurance' | 'depreciation';
  stageId: number;
  sheet: string | null;
  row: number | null;
  sourceFile: string | null;
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
  manufacturer: string | null;
  sourceModel: string | null;
  equipmentType: string | null;
  canonicalDraft: {
    assetType: string | null;
    category: string | null;
    manufacturer: string | null;
    model: string | null;
    serialNumber: string | null;
    licensePlate: string | null;
    sourceName: string | null;
    requiredBeforeCreation: string[];
    note: string;
  };
  insuredUf: number | null;
  netBookValueClp: number | null;
  dualSource: boolean;
  readyForReview: boolean;
  identityVerifiedSingleSource: boolean;
  modelOnlyNeedsOperationalIdentity: boolean;
  sourceCodeNeedsOperationalValidation: boolean;
  reviewStatus: string | null;
  reviewBasis: string | null;
  reviewSourceCount: number | null;
  review: null | {
    id: string;
    status: 'open' | 'accepted' | 'resolved' | 'ignored';
    resolutionNote: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  };
  sourceCount: number;
  evidenceCount: number;
  evidence: Evidence[];
};

type Response = {
  summary: {
    candidates: number;
    dualSource: number;
    readyForReview: number;
    identityVerifiedSingleSource: number;
    modelOnlyNeedsOperationalIdentity: number;
    sourceCodeNeedsOperationalValidation: number;
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
  const {data,error,isLoading,mutate}=useSWR<Response>('/api/finance/missing-asset-candidates',fetcher,{revalidateOnFocus:false});
  const [savingKey,setSavingKey]=useState<string|null>(null);

  const decide=async(key:string,decision:'accept'|'ignore'|'reopen')=>{
    setSavingKey(key);
    try{
      const response=await fetch('/api/finance/missing-asset-candidates',{
        method:'POST',
        headers:{'Content-Type':'application/json'},
        credentials:'include',
        body:JSON.stringify({key,decision}),
      });
      const payload=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(payload?.error||'No se pudo guardar la revisión');
      await mutate();
    } finally {
      setSavingKey(null);
    }
  };

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
        <Metric label="Identidad exacta · 1 fuente" value={number(data.summary.identityVerifiedSingleSource)} detail="PPU, serie o chasis sin contraparte canónica" />
        <Metric label="Pendientes de identidad" value={number(data.summary.modelOnlyNeedsOperationalIdentity+data.summary.sourceCodeNeedsOperationalValidation)} detail={number(data.summary.modelOnlyNeedsOperationalIdentity)+" por modelo · "+number(data.summary.sourceCodeNeedsOperationalValidation)+" por código fuente"} />
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
                    {candidate.readyForReview ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Lista para revisión</Badge> : candidate.identityVerifiedSingleSource ? <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3"/>Identidad exacta · 1 fuente</Badge> : candidate.modelOnlyNeedsOperationalIdentity ? <Badge variant="outline">Falta identidad operacional</Badge> : candidate.sourceCodeNeedsOperationalValidation ? <Badge variant="outline">Código fuente por validar</Badge> : candidate.dualSource ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Doble respaldo</Badge> : <Badge variant="outline">{candidate.evidence[0]?.source==='insurance'?'Seguro':'Depreciación'}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[candidate.plate?'PPU '+candidate.plate:null,candidate.serial?'Serie '+candidate.serial:null,candidate.chassis?'Chasis '+candidate.chassis:null,candidate.engine?'Motor '+candidate.engine:null,candidate.modelYear?'Año '+candidate.modelYear:null].filter(Boolean).join(' · ')||'Identificador desde evidencia fuente'}
                  </p>
                  {candidate.readyForReview ? <p className="mt-1 text-xs text-primary">Sin contraparte canónica exacta · preparada para revisión operacional</p> : candidate.identityVerifiedSingleSource ? <p className="mt-1 text-xs text-muted-foreground">Identificador físico exacto verificado · falta segunda fuente o validación operacional</p> : candidate.modelOnlyNeedsOperationalIdentity ? <p className="mt-1 text-xs text-muted-foreground">Modelo específico presente · falta PPU, serie, chasis o número de unidad</p> : candidate.sourceCodeNeedsOperationalValidation ? <p className="mt-1 text-xs text-muted-foreground">Código estable de la fuente financiera · falta equivalencia operacional</p> : null}
                </div>
                <Value label="Valor libro" value={money(candidate.netBookValueClp)} />
                <Value label="Seguro" value={uf(candidate.insuredUf)} />
                <Value label="Evidencias" value={number(candidate.evidenceCount)} />
              </div>
              {candidate.readyForReview ? (
                <div className="mt-3 rounded-md border bg-muted/20 p-3">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs">
                    <span className="font-medium">Borrador de alta</span>
                    {candidate.canonicalDraft.assetType ? <span className="text-muted-foreground">Tipo {candidate.canonicalDraft.assetType}</span> : null}
                    {candidate.canonicalDraft.category ? <span className="text-muted-foreground">{candidate.canonicalDraft.category}</span> : null}
                    {candidate.manufacturer ? <span className="text-muted-foreground">{candidate.manufacturer}{candidate.sourceModel?' · '+candidate.sourceModel:''}</span> : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Falta código de activo y lote canónico aprobado. La evidencia financiera queda preservada; la Ficha 360 no se crea desde esta pantalla.
                  </p>
                </div>
              ) : null}
              {candidate.readyForReview ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {candidate.review?.status === 'accepted' ? (
                    <>
                      <Badge variant="secondary">Aprobada para alta</Badge>
                      <Button size="sm" variant="outline" disabled={savingKey===candidate.key} onClick={()=>decide(candidate.key,'reopen')}>Reabrir</Button>
                    </>
                  ) : candidate.review?.status === 'ignored' ? (
                    <>
                      <Badge variant="outline">No corresponde</Badge>
                      <Button size="sm" variant="outline" disabled={savingKey===candidate.key} onClick={()=>decide(candidate.key,'reopen')}>Reabrir</Button>
                    </>
                  ) : (
                    <>
                      <Button size="sm" disabled={savingKey===candidate.key} onClick={()=>decide(candidate.key,'accept')}>Aprobar para alta</Button>
                      <Button size="sm" variant="outline" disabled={savingKey===candidate.key} onClick={()=>decide(candidate.key,'ignore')}>No corresponde</Button>
                    </>
                  )}
                  {candidate.review?.reviewedAt ? <span className="text-xs text-muted-foreground">Última revisión registrada</span> : null}
                </div>
              ) : null}
              <details className="mt-3">
                <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Ver evidencia</summary>
                <div className="mt-2 space-y-2 rounded-md border bg-muted/20 p-3">
                  {candidate.evidence.map((item)=>(
                    <div key={item.source+'-'+item.stageId} className="text-xs leading-5">
                      <span className="font-medium text-foreground">{item.source==='insurance'?'Seguro':'Depreciación'}</span>
                      <span className="text-muted-foreground"> · {item.sourceFile||'Fuente financiera'} · {item.sheet||'Sin hoja'} · fila {item.row??'—'}</span>
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
