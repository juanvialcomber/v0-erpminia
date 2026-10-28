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
  duplicateRisk: {
    active: boolean;
    basis: string | null;
    assetCode: string | null;
  };
  reviewSourceCount: number | null;
  operationalEvidence: {
    purchaseCostCenter: string | null;
    purchaseDescriptionExactPlate: boolean;
    purchaseOrders: number | null;
    purchaseLines: number | null;
  };
  internalMasterVerification: {
    verified: boolean;
    result: string | null;
    sources: string[];
  };
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
    candidateBookValueClp: number;
    readyForReviewBookValueClp: number;
    identityVerifiedSingleSourceBookValueClp: number;
    modelOnlyBookValueClp: number;
    sourceCodeBookValueClp: number;
    dualSource: number;
    readyForReview: number;
    readyDualFinance: number;
    readyPurchaseEvidence: number;
    readyPurchaseCostCenter: number;
    readyPurchaseDescription: number;
    pendingReview: number;
    acceptedForCreation: number;
    ignoredCandidates: number;
    duplicateRiskCandidates: number;
    openIdentityConflicts: number;
    identityVerifiedSingleSource: number;
    exactSingleVerifiedAbsentInternalMasters: number;
    modelOnlyNeedsOperationalIdentity: number;
    sourceCodeNeedsOperationalValidation: number;
    insuranceOnly: number;
    depreciationOnly: number;
  };
  identityConflicts: Array<{
    id: string;
    issueKey: string;
    entityId: string | null;
    status: string;
    resolutionNote: string | null;
    evidenceReference: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
  }>;
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
      {data.summary.modelOnlyNeedsOperationalIdentity>0 ? (
        <section className="flex flex-col gap-2 rounded-lg border bg-card px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-primary">Mayor impacto pendiente</p>
            <p className="mt-1 text-sm font-medium">{number(data.summary.modelOnlyNeedsOperationalIdentity)} modelos concentran {money(data.summary.modelOnlyBookValueClp)}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">Falta PPU, serie, chasis o número de unidad. No se infiere la identidad.</p>
          </div>
          <Badge variant="outline">Identidad operacional</Badge>
        </section>
      ) : null}

      <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Candidatas" value={number(data.summary.candidates)} detail={money(data.summary.candidateBookValueClp)+" de valor libro representado"} />
        <Metric label="Por decidir" value={number(data.summary.pendingReview)} detail={number(data.summary.readyDualFinance)+" seguro+depreciación · "+number(data.summary.readyPurchaseCostCenter)+" centro Compras · "+number(data.summary.readyPurchaseDescription)+" orden Compras"} />
        <Metric label="Identidad exacta · 1 fuente" value={number(data.summary.identityVerifiedSingleSource)} detail={number(data.summary.exactSingleVerifiedAbsentInternalMasters)+" verificadas en 3 maestros internos"} />
        <Metric label="Posible duplicado" value={number(data.summary.duplicateRiskCandidates)} detail="Requiere confirmar contra una Ficha existente antes de alta" />
        <Metric label="Conflictos" value={number(data.summary.openIdentityConflicts)} detail="Ficha existente vs fuente nueva" />
      </section>

      {data.identityConflicts.length ? (
        <section className="overflow-hidden rounded-lg border bg-card">
          <div className="border-b px-4 py-3">
            <h2 className="text-sm font-semibold">Conflictos de identidad</h2>
            <p className="mt-1 text-xs text-muted-foreground">Una Ficha 360 existente y una fuente nueva discrepan. No se crea un activo nuevo hasta resolver el conflicto.</p>
          </div>
          <div className="divide-y">
            {data.identityConflicts.map((conflict)=>(
              <div key={conflict.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="outline">Revisión humana</Badge>
                  <p className="text-sm font-medium">{conflict.evidenceReference||conflict.issueKey}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="overflow-hidden rounded-lg border bg-card">
        <div className="border-b px-4 py-3">
          <h2 className="text-sm font-semibold">Prioridad de revisión</h2>
          <p className="mt-1 text-xs text-muted-foreground">Primero evidencia cruzada; luego identificadores físicos explícitos. Crear la Ficha 360 sigue requiriendo revisión operacional.</p>
        </div>
        <div className="divide-y">
          {data.candidates.map((candidate)=>(
            <article key={candidate.key} className="px-4 py-4">
              <div className="grid gap-4 lg:grid-cols-[minmax(0,1.5fr)_160px_160px_160px] lg:items-center">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">{candidate.title}</p>
                    {candidate.duplicateRisk.active ? <Badge variant="destructive">Posible duplicado</Badge> : candidate.readyForReview ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Lista para revisión</Badge> : candidate.identityVerifiedSingleSource ? <Badge variant="outline"><ShieldCheck className="mr-1 h-3 w-3"/>Identidad exacta · 1 fuente</Badge> : candidate.modelOnlyNeedsOperationalIdentity ? <Badge variant="outline">Falta identidad operacional</Badge> : candidate.sourceCodeNeedsOperationalValidation ? <Badge variant="outline">Código fuente por validar</Badge> : candidate.dualSource ? <Badge variant="secondary"><ShieldCheck className="mr-1 h-3 w-3"/>Doble respaldo</Badge> : <Badge variant="outline">{candidate.evidence[0]?.source==='insurance'?'Seguro':'Depreciación'}</Badge>}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {[candidate.plate?'PPU '+candidate.plate:null,candidate.serial?'Serie '+candidate.serial:null,candidate.chassis?'Chasis '+candidate.chassis:null,candidate.engine?'Motor '+candidate.engine:null,candidate.modelYear?'Año '+candidate.modelYear:null].filter(Boolean).join(' · ')||'Identificador desde evidencia fuente'}
                  </p>
                  {candidate.duplicateRisk.active ? <p className="mt-1 text-xs text-destructive">Confirmar contra {candidate.duplicateRisk.assetCode||'la Ficha 360 existente'} antes de crear una nueva.</p> : candidate.readyForReview ? <p className="mt-1 text-xs text-primary">{candidate.reviewBasis==='exact_plate_plus_purchase_cost_center'?'PPU exacta + centro de costo en Compras':candidate.reviewBasis==='exact_plate_plus_purchase_description'?'PPU exacta en orden de compra':'Evidencia exacta en seguro + depreciación'} · sin contraparte canónica exacta</p> : candidate.identityVerifiedSingleSource ? <p className="mt-1 text-xs text-muted-foreground">{candidate.internalMasterVerification.verified?'Identificador exacto · 0 contrapartes exactas en 3 maestros internos':'Identificador físico exacto verificado'} · falta segunda fuente operacional</p> : candidate.modelOnlyNeedsOperationalIdentity ? <p className="mt-1 text-xs text-muted-foreground">Modelo específico presente · falta PPU, serie, chasis o número de unidad</p> : candidate.sourceCodeNeedsOperationalValidation ? <p className="mt-1 text-xs text-muted-foreground">Código estable de la fuente financiera · falta equivalencia operacional</p> : null}
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
                  {candidate.operationalEvidence.purchaseCostCenter ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Compras: {candidate.operationalEvidence.purchaseCostCenter} · {number(candidate.operationalEvidence.purchaseOrders||0)} órdenes · {number(candidate.operationalEvidence.purchaseLines||0)} líneas.
                    </p>
                  ) : candidate.operationalEvidence.purchaseDescriptionExactPlate ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Compras: PPU exacta en {number(candidate.operationalEvidence.purchaseOrders||0)} órdenes · {number(candidate.operationalEvidence.purchaseLines||0)} líneas.
                    </p>
                  ) : null}
                  <p className="mt-1 text-xs text-muted-foreground">
                    Falta código de activo y lote canónico aprobado. La evidencia queda preservada; la Ficha 360 no se crea desde esta pantalla.
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
