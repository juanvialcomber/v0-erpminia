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

    {!isLoading&&data?.history?.count?<section className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-sm font-semibold">Evolución observada</h2>
        <p className="mt-1 text-xs text-muted-foreground">Snapshots diarios. No se recalcula el pasado con información futura.</p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Días observados</p><p className="mt-1 text-xl font-semibold">{n(data.history.count)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Revisiones matching</p><p className="mt-1 text-xl font-semibold">{n(data.history.latest?.assisted_decision?.matchReviews)}</p><p className="text-xs text-muted-foreground">inicio {n(data.history.first?.assisted_decision?.matchReviews)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Resultados cerrados</p><p className="mt-1 text-xl font-semibold">{n(data.history.latest?.outcomes?.closed)}</p><p className="text-xs text-muted-foreground">inicio {n(data.history.first?.outcomes?.closed)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Impactos E3</p><p className="mt-1 text-xl font-semibold">{n(data.history.latest?.observed_impact?.e3Records)}</p><p className="text-xs text-muted-foreground">inicio {n(data.history.first?.observed_impact?.e3Records)}</p></div>
      </div>
    </section>:null}

    {!isLoading&&data?.contractBaseline?<section className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-sm font-semibold">Contrato y propuesta vs evolución</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Fuente: correo enviado a Daniel el 4 de mayo de 2026. La copia contractual encontrada es un borrador con placeholders; falta localizar la versión final firmada.
        </p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Módulos explícitos contrato</p><p className="mt-1 text-xl font-semibold">{data.contractBaseline.explicitContract.modules.length}</p><p className="text-xs text-muted-foreground">Mantención · Inventario · Documental</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Desarrollo neto</p><p className="mt-1 text-xl font-semibold">{money(data.contractBaseline.explicitContract.developmentNetClp)}</p><p className="text-xs text-muted-foreground">30% · 40% · 30%</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Soporte mensual neto</p><p className="mt-1 text-xl font-semibold">{money(data.contractBaseline.explicitContract.monthlySupportNetClp)}</p><p className="text-xs text-muted-foreground">desde operación módulos 1 y 2</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Áreas propuesta</p><p className="mt-1 text-xl font-semibold">{data.contractBaseline.commercialProposal.functionalAreas.length}</p><p className="text-xs text-muted-foreground">visión comercial más amplia</p></div>
      </div>
      <div className="grid gap-5 border-t p-5 xl:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Base comprometida explícita</p>
          <ul className="mt-3 space-y-2 text-sm">{data.contractBaseline.explicitContract.services.map((item:string)=><li key={item}>• {item}</li>)}</ul>
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Capacidades adicionales actuales</p>
          <ul className="mt-3 space-y-2 text-sm">{data.contractBaseline.currentExpansionExamples.map((item:any)=><li key={item.capability}>• <span className="font-medium">{item.capability}</span><span className="text-muted-foreground"> — {item.rationale}</span></li>)}</ul>
        </div>
      </div>
      {data.contractBaseline.documentaryTensions.map((item:any)=><div key={item.topic} className="border-t bg-muted/20 p-4 text-xs text-muted-foreground"><span className="font-medium text-foreground">{item.topic}:</span> {item.rule}</div>)}
    </section>:null}

    {!isLoading&&data?.comparison?<section className="rounded-lg border bg-card">
      <div className="border-b p-5">
        <h2 className="text-sm font-semibold">Comparación comercial del período</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          {data.comparison.mode === '30d'
            ? 'Últimos 30 días observados.'
            : data.comparison.mode === 'available-history'
              ? 'Comparación contra el primer snapshot disponible.'
              : 'Baseline inicial: aún no existe historia suficiente para medir cambio.'}
        </p>
      </div>
      <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Revisiones nuevas</p><p className="mt-1 text-xl font-semibold">+{n(data.comparison.deltas.matchReviews)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Acciones nuevas</p><p className="mt-1 text-xl font-semibold">+{n(data.comparison.deltas.supplyActions)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Resultados cerrados</p><p className="mt-1 text-xl font-semibold">+{n(data.comparison.deltas.closedOutcomes)}</p></div>
        <div className="bg-card p-4"><p className="text-xs text-muted-foreground">Casos E3 nuevos</p><p className="mt-1 text-xl font-semibold">+{n(data.comparison.deltas.e3Records)}</p></div>
      </div>
      <div className="border-t p-5">
        <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Evidencia defendible</p>
        {data.commercialEvidence?.length ? (
          <ul className="mt-3 space-y-2 text-sm">
            {data.commercialEvidence.map((item:string)=><li key={item}>• {item}</li>)}
          </ul>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">Todavía no existe delta observado. El baseline ya quedó congelado para medirlo correctamente desde ahora.</p>
        )}
      </div>
    </section>:null}

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
