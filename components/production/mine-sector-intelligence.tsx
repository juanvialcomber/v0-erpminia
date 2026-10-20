'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { Activity, AlertTriangle, Beaker, CheckCircle2, Clock3, Drill, Factory, Layers3, MapPinned, Target, Truck } from 'lucide-react';
import { StatePanel } from '@/components/ui/state-panel';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';

type Attention='alert'|'watch'|'ok'|'no_comparison';
type MineRow={key:string;mineName:string;actualTons:number;movements:number;plannedTons:number;expectedTonsToCutoff:number;plannedGradePct:number|null;observedVsExpectedPct:number|null;attention:Attention};
type SectorRow={key:string;mineName:string;sectorName:string;actualTons:number;movements:number;drillingMetersHistorical:number;drillingReportsHistorical:number;drillingHoles:number;drillingReconciliationPct:number|null;plannedAdvanceM:number;plannedDrillingM:number};
type Data={periodStart:string|null;dataThrough:string|null;plantThrough:string|null;transportThrough:string|null;mineSourceCutoff?:string|null;plan:any;mines:MineRow[];sectors:SectorRow[];sourceCoverage:{transportPlanFraction:number;elapsedTransportDays:number;totalPlanDays:number;policy:string};attention:{alert:number;watch:number;ok:number;noComparison:number};plantContext:null|{scope:string;treatedTons:number;avgHeadGradePct:number|null;avgRecoveryPct:number|null;shifts:number;assayed:number;assayCoveragePct:number;note:string};drillingFreshness:any;semantics:{transport:string;plan:string;drilling:string;plant:string}};
type ExecutiveException={key:string;severity:'critical'|'warning'|'info';title:string;evidence:string;action:string};
const fetcher=async(url:string)=>{const r=await fetch(url,{credentials:'include'});const j=await r.json();if(!r.ok)throw new Error(j.error||'Error');return j;};
const n=(v:number,d=0)=>v.toLocaleString('es-CL',{maximumFractionDigits:d});
const pct=(v:number|null|undefined,d=1)=>v===null||v===undefined?'—':`${n(v,d)}%`;
const date=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):'N/D';
const dayDiff=(later:string|null|undefined,earlier:string|null|undefined)=>{
  if(!later||!earlier)return null;
  return Math.round((new Date(`${later}T12:00:00Z`).getTime()-new Date(`${earlier}T12:00:00Z`).getTime())/86400000);
};

export function MineSectorIntelligence(){
  const {data,error,isLoading}=useSWR<Data>('/api/produccion/inteligencia',fetcher);
  const [selected,setSelected]=useState('');
  const row=useMemo(()=>data?.sectors.find(x=>x.key===selected)||data?.sectors[0]||null,[data,selected]);
  const sectorMeasureLabel=data?.mineSourceCutoff?'Extracción sector':'Transportado sector';
  const sectorTableLabel=data?.mineSourceCutoff?'Extracción t':'Transportado t';
  const executiveExceptions=useMemo<ExecutiveException[]>(()=>{
    if(!data)return [];
    const items:ExecutiveException[]=[];
    for(const mine of data.mines){
      if(mine.attention!=='alert'&&mine.attention!=='watch')continue;
      const gap=Math.max(0,mine.expectedTonsToCutoff-mine.actualTons);
      items.push({
        key:`mine-${mine.key}`,
        severity:mine.attention==='alert'?'critical':'warning',
        title:`${mine.mineName}: ${mine.attention==='alert'?'bajo ritmo':'ritmo en vigilancia'}`,
        evidence:`${n(mine.actualTons,1)} t observadas vs ${n(mine.expectedTonsToCutoff,1)} t esperadas al corte (${pct(mine.observedVsExpectedPct)}). Brecha ${n(gap,1)} t.`,
        action:'Revisar secuencia de extracción y transporte de la mina antes del siguiente cierre operacional.',
      });
    }
    const sourceLag=dayDiff(data.plantThrough,data.transportThrough);
    if(sourceLag!==null&&sourceLag>=3){
      items.push({
        key:'transport-freshness',
        severity:sourceLag>=7?'warning':'info',
        title:'Transporte más atrasado que Planta',
        evidence:`TM llega hasta ${date(data.transportThrough)} y Planta hasta ${date(data.plantThrough)}: ${sourceLag} días de diferencia.`,
        action:'Actualizar la fuente TM antes de interpretar como actual cualquier desvío de ritmo por mina.',
      });
    }
    const drillingLag=dayDiff(data.dataThrough,data.drillingFreshness?.max_date||null);
    if(drillingLag!==null&&drillingLag>=3){
      items.push({
        key:'drilling-freshness',
        severity:drillingLag>=7?'warning':'info',
        title:'Sondaje con rezago de actualización',
        evidence:`Último reporte ${date(data.drillingFreshness?.max_date)}; referencia operacional ${date(data.dataThrough)}.`,
        action:'Validar carga de reportes de sondaje antes de usar su contexto para decisiones recientes.',
      });
    }
    return items.sort((a,b)=>({critical:0,warning:1,info:2}[a.severity]-{critical:0,warning:1,info:2}[b.severity]));
  },[data]);
  if(error)return <StatePanel tone="error" title="No fue posible cargar inteligencia de Producción" description={error.message}/>;
  if(isLoading||!data)return <StatePanel tone="neutral" title="Cargando inteligencia operacional" description="Integrando plan, transporte, sondaje y Planta."/>;

  return <div className="space-y-6">
    <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Producción · Inteligencia integrada</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Ritmo por mina</h1><p className="mt-2 max-w-4xl text-sm text-muted-foreground">Extracción canónica hasta {date(data.mineSourceCutoff||data.dataThrough)}. TM detallado llega hasta {date(data.transportThrough)} y Planta metalúrgica hasta {date(data.plantThrough)}.</p></div>

    <WhatsappOperationalUpdates mode="mine"/>

    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex items-end justify-between gap-4 border-b px-4 py-3"><div><h2 className="font-medium">Qué requiere atención</h2><p className="mt-1 text-xs text-muted-foreground">Sólo excepciones que cambian una decisión.</p></div><span className="text-sm font-medium">{executiveExceptions.length}</span></div>
      {executiveExceptions.length===0?<div className="flex items-center gap-3 px-4 py-4"><CheckCircle2 className="h-5 w-5 text-muted-foreground"/><div><p className="text-sm font-medium">Sin excepciones</p><p className="text-xs text-muted-foreground">No hay condiciones que requieran escalamiento.</p></div></div>:<div className="divide-y">{executiveExceptions.slice(0,3).map(item=><div key={item.key} className="px-4 py-4"><div className="flex items-start gap-2"><ExceptionIcon severity={item.severity}/><div><p className="text-sm font-medium">{item.title}</p><p className="mt-1 text-sm text-muted-foreground">{item.action}</p></div></div></div>)}</div>}
    </section>

    <section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <Metric icon={AlertTriangle} label="Alerta" value={n(data.attention.alert)} detail="Requieren atención"/>
      <Metric icon={Activity} label="Vigilancia" value={n(data.attention.watch)} detail="Seguir de cerca"/>
      <Metric icon={CheckCircle2} label="En ritmo" value={n(data.attention.ok)} detail="Sin desvío relevante"/>
    </section>

    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver cobertura de fuentes</summary>
      <div className="grid gap-px border-t bg-border sm:grid-cols-3">
        <Metric icon={Truck} label="Cobertura TM" value={pct(data.sourceCoverage.transportPlanFraction*100)} detail={`${data.sourceCoverage.elapsedTransportDays}/${data.sourceCoverage.totalPlanDays} días`}/>
        <Metric icon={Factory} label="Tratado Planta" value={data.plantContext?`${n(data.plantContext.treatedTons,1)} t`:'—'} detail={`Hasta ${date(data.plantThrough)}`}/>
        <Metric icon={Beaker} label="Cobertura ensayo" value={data.plantContext?pct(data.plantContext.assayCoveragePct):'—'} detail={data.plantContext?`${data.plantContext.assayed}/${data.plantContext.shifts} turnos`:'Sin datos'}/>
      </div>
    </details>

    <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><h2 className="font-medium">Ritmo operacional por mina</h2><p className="mt-1 text-xs text-muted-foreground">Única comparación de tonelaje plan vs observado usada para priorización.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[760px] text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Mina</th><th className="px-4 py-3 text-left">Estado</th><th className="px-4 py-3 text-right">Observado t</th><th className="px-4 py-3 text-right">Esperado al corte t</th><th className="px-4 py-3 text-right">Ritmo</th><th className="px-4 py-3 text-right">Plan mes t</th><th className="px-4 py-3 text-right">Ley plan</th></tr></thead><tbody className="divide-y">{data.mines.map(x=><tr key={x.key} className="hover:bg-muted/20"><td className="px-4 py-3 font-medium">{x.mineName}</td><td className="px-4 py-3">{attentionLabel(x.attention)}</td><td className="px-4 py-3 text-right">{n(x.actualTons,1)}</td><td className="px-4 py-3 text-right">{x.expectedTonsToCutoff?n(x.expectedTonsToCutoff,1):'—'}</td><td className="px-4 py-3 text-right">{pct(x.observedVsExpectedPct)}</td><td className="px-4 py-3 text-right">{x.plannedTons?n(x.plannedTons,1):'—'}</td><td className="px-4 py-3 text-right">{x.plannedGradePct===null?'—':`${n(x.plannedGradePct,3)}%`}</td></tr>)}</tbody></table></div></section>

    <section className="grid gap-4 lg:grid-cols-2">
      <div className="rounded-lg border bg-card p-4"><h2 className="font-medium">Contexto Planta</h2><div className="mt-4 grid gap-3 sm:grid-cols-2"><Item label="Ley cabeza global" value={data.plantContext?.avgHeadGradePct==null?'N/D':`${n(data.plantContext.avgHeadGradePct,3)}% Cu`}/><Item label="Recuperación global" value={data.plantContext?.avgRecoveryPct==null?'N/D':pct(data.plantContext.avgRecoveryPct,2)}/></div><div className="mt-4 flex gap-2 rounded-md border px-3 py-3 text-sm text-muted-foreground"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/><p>{data.plantContext?.note||'Sin contexto metalúrgico.'}</p></div></div>
      <div className="rounded-lg border bg-card p-4"><h2 className="font-medium">Regla de interpretación</h2><div className="mt-4 space-y-3 text-sm text-muted-foreground"><p><strong className="font-medium text-foreground">Plan:</strong> {data.semantics.plan}</p><p><strong className="font-medium text-foreground">Transporte:</strong> {data.semantics.transport}</p><p><strong className="font-medium text-foreground">Sondaje:</strong> {data.semantics.drilling}</p></div></div>
    </section>

    <section className="rounded-lg border bg-card p-4"><label className="text-xs font-medium text-muted-foreground" htmlFor="sector-select">Contexto mina / sector</label><select id="sector-select" value={row?.key||''} onChange={e=>setSelected(e.target.value)} className="mt-2 h-10 w-full rounded-md border bg-background px-3 text-sm md:max-w-xl">{data.sectors.map(x=><option key={x.key} value={x.key}>{x.mineName} · {x.sectorName}</option>)}</select></section>

    {row?<section className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-6">
      <Metric icon={Truck} label={sectorMeasureLabel} value={`${n(row.actualTons,1)} t`} detail={data.mineSourceCutoff?`Fuente canónica al ${date(data.mineSourceCutoff)}`:`${n(row.movements)} movimientos aprobados`}/>
      <Metric icon={Drill} label="Sondaje histórico" value={row.drillingReportsHistorical?`${n(row.drillingMetersHistorical,1)} m`:'N/D'} detail={row.drillingReportsHistorical?`${n(row.drillingReportsHistorical)} registros · ${n(row.drillingHoles)} pozos`:'Sin evidencia asociada'}/>
      <Metric icon={Layers3} label="Avance plan" value={row.plannedAdvanceM?`${n(row.plannedAdvanceM,1)} m`:'N/D'} detail="Sólo línea development atribuida"/>
      <Metric icon={Target} label="Perforación plan" value={row.plannedDrillingM?`${n(row.plannedDrillingM,1)} m`:'N/D'} detail="Sólo línea radial_drilling atribuida"/>
      <Metric icon={MapPinned} label="Linaje sondaje" value={pct(row.drillingReconciliationPct)} detail="Reportes con Mina + Sector + Pozo"/>
      <Metric icon={Factory} label="Planta" value="Global" detail="Sin atribución sectorial inventada"/>
    </section>:<StatePanel tone="neutral" title="Sin sectores disponibles" description="No existe información suficiente para construir contexto sectorial."/>}

    <section className="overflow-hidden rounded-lg border bg-card"><div className="border-b px-4 py-3"><h2 className="font-medium">Contexto operacional por sector</h2><p className="mt-1 text-xs text-muted-foreground">Sin semáforo de tonelaje sectorial: la fuente no entrega una meta sectorial canónica comparable.</p></div><div className="overflow-x-auto"><table className="w-full min-w-[860px] text-sm"><thead className="bg-muted/30 text-xs text-muted-foreground"><tr><th className="px-4 py-3 text-left">Mina / sector</th><th className="px-4 py-3 text-right">{sectorTableLabel}</th><th className="px-4 py-3 text-right">Movimientos</th><th className="px-4 py-3 text-right">Sondaje m</th><th className="px-4 py-3 text-right">Avance plan m</th><th className="px-4 py-3 text-right">Perforación plan m</th></tr></thead><tbody className="divide-y">{data.sectors.slice(0,40).map(x=><tr key={x.key} className="hover:bg-muted/20"><td className="px-4 py-3"><button className="text-left font-medium hover:underline" onClick={()=>setSelected(x.key)}>{x.mineName} · {x.sectorName}</button></td><td className="px-4 py-3 text-right">{n(x.actualTons,1)}</td><td className="px-4 py-3 text-right">{n(x.movements)}</td><td className="px-4 py-3 text-right">{x.drillingReportsHistorical?n(x.drillingMetersHistorical,1):'—'}</td><td className="px-4 py-3 text-right">{x.plannedAdvanceM?n(x.plannedAdvanceM,1):'—'}</td><td className="px-4 py-3 text-right">{x.plannedDrillingM?n(x.plannedDrillingM,1):'—'}</td></tr>)}</tbody></table></div></section>

    <div className="rounded-lg border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground"><strong className="font-medium text-foreground">Regla:</strong> {data.sourceCoverage.policy}</div>
  </div>;
}
function Metric({icon:Icon,label,value,detail}:{icon:any;label:string;value:string;detail:string}){return <div className="bg-card px-4 py-4"><div className="flex items-center justify-between"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-muted-foreground"/></div><p className="mt-2 text-xl font-semibold">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>}
function Item({label,value}:{label:string;value:string}){return <div><dt className="text-xs text-muted-foreground">{label}</dt><dd className="mt-1 font-medium">{value}</dd></div>}
function ExceptionIcon({severity}:{severity:ExecutiveException['severity']}){return severity==='critical'?<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>:severity==='warning'?<Clock3 className="mt-0.5 h-4 w-4 shrink-0"/>:<Activity className="mt-0.5 h-4 w-4 shrink-0"/>}
function attentionLabel(v:Attention){return v==='alert'?'Alerta':v==='watch'?'Vigilancia':v==='ok'?'En ritmo':'Sin comparación'}
