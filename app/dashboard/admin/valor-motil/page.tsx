'use client';

import useSWR from 'swr';
import { Activity, BadgeDollarSign, BrainCircuit, Database, Gauge, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';

const fetcher=async(url:string)=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error||'No se pudo cargar Valor MOTIL.');
  return payload;
};

const n=(v:number|null|undefined)=>typeof v==='number'?new Intl.NumberFormat('es-CL',{maximumFractionDigits:1}).format(v):'—';
const money=(v:number|null|undefined)=>typeof v==='number'?new Intl.NumberFormat('es-CL',{style:'currency',currency:'CLP',maximumFractionDigits:0}).format(v):'—';
const pct=(v:number|null|undefined)=>typeof v==='number'?Math.round(v*100)+'%':'—';

export default function MotilValuePage(){
  const {data,error,isLoading}=useSWR('/api/admin/value-scorecard',fetcher,{revalidateOnFocus:false,refreshInterval:300000});

  if(error) return <Card><CardContent className="pt-6 text-sm text-muted-foreground">{error.message}</CardContent></Card>;

  return <div className="space-y-6">
    <section className="border-b pb-5">
      <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">Administración · Evidencia comercial</p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Valor MOTIL</h1>
          <p className="mt-2 max-w-3xl text-sm text-muted-foreground">Scorecard vivo para separar capacidad técnica, uso, resultados e impacto observado. No convierte estimaciones en ROI.</p>
        </div>
        {!isLoading&&data?<div className="flex gap-2"><Badge variant="outline">Evidencia {data.evidenceLevel}</Badge><Badge variant="outline">{data.scaleGate}</Badge><Badge variant="outline">L{data.workflowLevel}</Badge></div>:null}
      </div>
    </section>

    <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Datos conectados',data?.connectedData?.purchaseOrders,'OC Laudus',Database],
        ['Decisiones asistidas',data?.assistedDecision?.supplyDecisions,'abastecimiento',BrainCircuit],
        ['Resultados cerrados',data?.outcomes?.closed,'acciones',Activity],
        ['Evidencia E3',data?.observedImpact?.e3Records,'casos documentados',ShieldCheck],
      ].map(([label,value,detail,Icon]:any)=><div key={label} className="bg-card p-5"><Icon className="h-4 w-4 text-muted-foreground"/><p className="mt-3 text-2xl font-semibold">{isLoading?'—':n(value)}</p><p className="mt-1 text-xs text-muted-foreground">{label} · {detail}</p></div>)}
    </section>

    {!isLoading&&data?<div className="grid gap-4 xl:grid-cols-2">
      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2"><Gauge className="h-4 w-4"/><h2 className="text-sm font-semibold">Adopción y desempeño</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Revisiones matching</p><p className="text-xl font-semibold">{n(data.assistedDecision.matchReviews)}</p><p className="text-xs text-muted-foreground">Aceptación {pct(data.assistedDecision.matchAcceptanceRate)}</p></div>
          <div><p className="text-xs text-muted-foreground">Tiempo medio revisión</p><p className="text-xl font-semibold">{n(data.assistedDecision.averageMatchReviewSeconds)} s</p></div>
          <div><p className="text-xs text-muted-foreground">Acciones abastecimiento</p><p className="text-xl font-semibold">{n(data.assistedDecision.supplyActions)}</p><p className="text-xs text-muted-foreground">Tasa {pct(data.assistedDecision.supplyActionRate)}</p></div>
          <div><p className="text-xs text-muted-foreground">Resultado positivo</p><p className="text-xl font-semibold">{pct(data.outcomes.positiveRate)}</p><p className="text-xs text-muted-foreground">Reducción riesgo media {n(data.outcomes.averageRiskReduction)}</p></div>
        </div>
      </section>

      <section className="rounded-lg border bg-card p-5">
        <div className="flex items-center gap-2"><BadgeDollarSign className="h-4 w-4"/><h2 className="text-sm font-semibold">Impacto observado</h2></div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div><p className="text-xs text-muted-foreground">Registros</p><p className="text-xl font-semibold">{n(data.observedImpact.records)}</p></div>
          <div><p className="text-xs text-muted-foreground">Minutos observados</p><p className="text-xl font-semibold">{n(data.observedImpact.observedMinutes)}</p></div>
          <div><p className="text-xs text-muted-foreground">Monto asociado</p><p className="text-xl font-semibold">{money(data.observedImpact.observedValueClp)}</p></div>
          <div><p className="text-xs text-muted-foreground">Tratamiento</p><p className="text-sm font-medium">Evidencia operacional</p><p className="text-xs text-muted-foreground">No ahorro auditado · no contabilidad</p></div>
        </div>
      </section>
    </div>:null}

    {!isLoading&&data?<section className="rounded-lg border bg-card">
      <div className="border-b p-5"><h2 className="text-sm font-semibold">Gate para defender cambio de tarifa</h2><p className="mt-1 text-xs text-muted-foreground">No se escala por cantidad de features. Se escala cuando uso, resultados y evidencia convergen.</p></div>
      <div className="divide-y">
        {[
          ['20 revisiones de matching',data.adoptionGate.matchCalibration],
          ['5 resultados de abastecimiento',data.adoptionGate.supplyOutcomes],
          ['3 impactos E3 documentados',data.adoptionGate.valueEvidence],
        ].map(([label,status])=><div key={label} className="flex items-center justify-between px-5 py-3"><span className="text-sm">{label}</span><Badge variant="outline">{status}</Badge></div>)}
      </div>
    </section>:null}

    {!isLoading&&data?<section className="rounded-lg border bg-card p-5">
      <h2 className="text-sm font-semibold">Próxima evidencia</h2>
      {data.narrative.nextEvidence.length?<ul className="mt-3 space-y-2 text-sm text-muted-foreground">{data.narrative.nextEvidence.map((x:string)=><li key={x}>• {x}</li>)}</ul>:<p className="mt-2 text-sm text-muted-foreground">Los gates mínimos están completos; corresponde preparar validación comercial y baseline de ROI.</p>}
    </section>:null}
  </div>;
}
