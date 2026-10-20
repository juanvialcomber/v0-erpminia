'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { Activity, AlertTriangle, ArrowRight, Beaker, CheckCircle2, CircleDashed, Drill, Factory, Gauge, Gem, Map, PackageCheck, Target, Truck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { useModuleAccess } from '@/hooks/use-module-access';
import { WhatsappOperationalUpdates } from '@/components/production/whatsapp-operational-updates';
import { ProductionSourceSnapshot } from '@/components/production/production-source-snapshot';

type Overview = {
  counts: { materialMovements:number; plantShifts:number; metallurgyResults:number; concentrateShipments:number; drillingReports:number; drillingHoles:number };
  quality: { status:'PASS'|'HOLD'; pass:number; hold:number; sourceFiles:number; sourceSheets:number; supplementalRecords:number; sourceAnomalies:number; referenceOnly:number };
  freshness: { dataThrough:string|null; transportSourceThrough:string|null; drillingThrough:string|null };
  coverage: {
    queue: { importExceptions:number; movementNormalization:number; movementValidation:number; entityReconciliation:number; plantShifts:number; metallurgy:number; drillLocations:number };
    domains: Record<'transport'|'plant'|'drilling'|'chemistry'|'geology'|'topography', {
      status:'operational'|'partial'|'awaiting_source'; evidenceCount:number; reviewCount:number; dataThrough:string|null; note:string; coveragePct?:number; intervalCount?:number;
    }>;
  };
  currentPeriod: null | {
    periodStart:string; dataThrough:string; elapsedDays:number; daysInMonth:number; calendarProgressPct:number;
    treatedTons:number; containedCuTons:number; recoveredFineCuTons:number; avgHeadGradePct:number|null; avgRecoveryPct:number|null; plantShifts:number; deterministicShifts:number;
    dispatch:{ shipmentRows:number; validShipmentRows:number; reviewShipmentRows:number; wetMetricTons:number };
    transportComparable:{ sourceThrough:string|null; transportedTons:number; treatedTons:number; deltaTons:number };
    plan:null|{ code:string; mineralToPlantTons:number; targetCuGradePct:number|null; plannedDrillingM:number; plannedAdvanceM:number; treatmentProgressPct:number|null; paceIndexPct:number|null; projectedTreatmentTons:number|null; projectedPlanPct:number|null; gradeDeltaPctPoints:number|null };
  };
  intelligence:Array<{level:'info'|'watch'|'alert';code:string;title:string;detail:string}>;
  semantics:{ planVsActual:string; concentrate:string; sourceAbsence:string };
};

const fetcher = async (url:string):Promise<Overview> => { const r=await fetch(url,{credentials:'include'}); const j=await r.json(); if(!r.ok) throw new Error(j.error||'No fue posible cargar Producción'); return j; };
const n=(v:number,d=0)=>v.toLocaleString('es-CL',{maximumFractionDigits:d});
const tons=(v:number,d=0)=>`${n(v,d)} t`;
const pct=(v:number|null|undefined,d=1)=>v===null||v===undefined?'—':`${n(v,d)}%`;
const date=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium'}).format(new Date(`${v}T12:00:00`)):'Sin dato';
const period=(v:string|null|undefined)=>v?new Intl.DateTimeFormat('es-CL',{month:'long',year:'numeric'}).format(new Date(`${v}T12:00:00`)):'Sin período';

const domains=[
  {key:'transport',href:'/dashboard/produccion/transporte-mineral',title:'Transporte',unit:'movimientos',icon:Truck},
  {key:'plant',href:'/dashboard/produccion/planta-metalurgia',title:'Planta / Metalurgia',unit:'turnos',icon:Factory},
  {key:'drilling',href:'/dashboard/produccion/sondaje',title:'Perforación',unit:'pozos',icon:Drill},
  {key:'chemistry',href:'/dashboard/produccion/quimica',title:'Química',unit:'resultados',icon:Beaker},
  {key:'geology',href:'/dashboard/produccion/geologia',title:'Geología',unit:'registros externos',icon:Gem},
  {key:'topography',href:'/dashboard/produccion/topografia',title:'Topografía',unit:'levantamientos reales',icon:Map},
] as const;

export function ProduccionDashboard(){
  const {data,error,isLoading,mutate}=useSWR<Overview>('/api/produccion/canonical-overview',fetcher);
  const { canEdit, ready } = useModuleAccess();
  if(error) return <StatePanel tone="error" title="No fue posible cargar Producción" description={error.message} actions={<Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button>}/>;
  if(isLoading||!data) return <StatePanel tone="neutral" title="Cargando Producción" description="Leyendo KPI desde la capa canónica."/>;

  const p=data.currentPeriod;
  const plan=p?.plan;
  const pace=plan?.paceIndexPct ?? null;
  const paceLabel=pace===null?'—':pace>=97?'En ritmo':pace>=90?'Leve desvío':'Bajo ritmo';

  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Producción</PageHeaderEyebrow>
        <PageHeaderTitle>Producción</PageHeaderTitle>
        <PageHeaderDescription>{p?`${period(p.periodStart)} · Planta hasta ${date(p.dataThrough)}. Transporte sólo hasta ${date(data.freshness.transportSourceThrough)}.`:'Sin período operacional disponible.'}</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>{ready && canEdit('prod_operaciones') ? <Button asChild variant="outline"><Link href="/dashboard/produccion/ingreso-datos"><Upload className="h-4 w-4"/>Ingresar datos</Link></Button> : null}</PageHeaderActions>
    </PageHeader>

    <WhatsappOperationalUpdates mode="overview"/>
    <ProductionSourceSnapshot/>
    <div className="flex justify-end"><Link className="text-xs text-muted-foreground underline underline-offset-2" href="/dashboard/produccion/despachos">Ver coordinación informada de despachos</Link></div>

    <section className="rounded-lg border bg-card">
      <div className="border-b px-5 py-4"><h2 className="font-medium">Qué requiere atención</h2><p className="mt-1 text-xs text-muted-foreground">Sólo excepciones que cambian una decisión.</p></div>
      <div className="divide-y">{data.intelligence.length?data.intelligence.slice(0,3).map(signal=><div key={signal.code} className="flex gap-3 px-5 py-4"><SignalIcon level={signal.level}/><div><p className="text-sm font-medium">{signal.title}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{signal.detail}</p></div></div>):<div className="px-5 py-5 text-sm text-muted-foreground">Sin señales para el período.</div>}</div>
    </section>

    <section aria-label="Operación actual" className="space-y-3">
      <div><p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Ahora</p><h2 className="mt-1 text-lg font-semibold tracking-tight">Ejecución del período</h2></div>
      <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={Factory} label="Tratado" value={p?tons(p.treatedTons,1):'—'} detail={plan?`${pct(plan.treatmentProgressPct)} del plan`:'Sin plan activo'}/>
        <Metric icon={Target} label="Ritmo mensual" value={paceLabel} detail={plan?`Calendario ${pct(p?.calendarProgressPct)}`:'Sin comparación'}/>
        <Metric icon={Gauge} label="Ley cabeza Cu" value={pct(p?.avgHeadGradePct,3)} detail={plan?.targetCuGradePct!=null?`Objetivo ${pct(plan.targetCuGradePct,2)}`:'Sin objetivo'}/>
        <Metric icon={Activity} label="Recuperación" value={pct(p?.avgRecoveryPct,2)} detail={p?`${p.deterministicShifts}/${p.plantShifts} turnos`:'—'}/>
      </div>
      <details className="rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver resultado metalúrgico y despachos</summary>
        <div className="grid gap-px border-t bg-border sm:grid-cols-2">
          <Mini label="Cu fino recuperado" value={p?tons(p.recoveredFineCuTons,3):'—'} detail={p?`${tons(p.containedCuTons,3)} Cu contenido`:'—'}/>
          <Mini label="Concentrado despachado" value={p?tons(p.dispatch.wetMetricTons,2):'—'} detail={p?`${p.dispatch.validShipmentRows} válidos · ${p.dispatch.reviewShipmentRows} revisión`:'—'}/>
        </div>
      </details>
    </section>

    <details className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-5 py-4 text-sm font-medium">Ver plan vs ejecución</summary>
      <div className="border-t">
        <div className="grid gap-px bg-border md:grid-cols-4">
          <Mini label="Plan mineral a planta" value={plan?tons(plan.mineralToPlantTons):'—'} detail="Mes completo"/>
          <Mini label="Tratado acumulado" value={p?tons(p.treatedTons,1):'—'} detail={plan?`${pct(plan.treatmentProgressPct)} ejecutado`:'—'}/>
          <Mini label="Proyección simple" value={plan?.projectedTreatmentTons!=null?tons(plan.projectedTreatmentTons,0):'—'} detail={plan?.projectedPlanPct!=null?`${pct(plan.projectedPlanPct)} del plan`:'—'}/>
          <Mini label="Avance calendario" value={p?pct(p.calendarProgressPct):'—'} detail={p?`${p.elapsedDays}/${p.daysInMonth} días`:'—'}/>
        </div>
      </div>
    </details>

    <section className="rounded-lg border bg-card">
      <div className="border-b px-5 py-4"><h2 className="font-medium">Transporte comparable</h2><p className="mt-1 text-xs text-muted-foreground">Misma ventana de evidencia para transporte y tratamiento.</p></div>
      <div className="grid gap-px bg-border sm:grid-cols-3"><Mini label="Transportado" value={p?tons(p.transportComparable.transportedTons,1):'—'} detail={`Hasta ${date(p?.transportComparable.sourceThrough)}`}/><Mini label="Tratado comparable" value={p?tons(p.transportComparable.treatedTons,1):'—'} detail="Misma ventana"/><Mini label="Brecha comparable" value={p?tons(p.transportComparable.deltaTons,1):'—'} detail="No equivale a pérdida"/></div>
    </section>

    <CoverageOverview data={data}/>

    <details className="border-t pt-4 text-xs text-muted-foreground"><summary className="cursor-pointer font-medium text-foreground">Cómo leer estos datos</summary><p className="mt-2 max-w-4xl leading-5">{data.semantics.planVsActual} {data.semantics.concentrate} {data.semantics.sourceAbsence}</p></details>
  </div>;
}

function CoverageOverview({data}:{data:Overview}){
  const queue=data.coverage.queue;
  const qualityOk=data.quality.status==='PASS';
  const reviewItems=[
    `Importación ${n(queue.importExceptions)}`,
    `Transporte ${n(queue.movementValidation)} revisión / ${n(queue.movementNormalization)} sin normalizar`,
    `Identidades ${n(queue.entityReconciliation)}`,
    `Planta ${n(queue.plantShifts+queue.metallurgy)}`,
    `Pozos ${n(queue.drillLocations)}`,
  ];

  return <section aria-labelledby="production-coverage-title" className="space-y-3">
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Fuentes</p>
        <h2 id="production-coverage-title" className="mt-1 text-lg font-semibold tracking-tight">Estado de fuentes</h2>
      </div>
      <p className="max-w-xl text-xs leading-5 text-muted-foreground">Detalle secundario de cobertura. Sin fuente nunca se representa como cero.</p>
    </div>

    <div className="overflow-hidden rounded-lg border bg-card divide-y">
      {domains.map((domain)=>{
        const coverage=data.coverage.domains[domain.key];
        const Icon=domain.icon;
        const meta=coverageStatus(coverage.status);
        const StatusIcon=meta.icon;
        return <Link key={domain.key} href={domain.href} aria-label={`Abrir ${domain.title}: ${meta.label}`} className="group grid gap-3 px-4 py-3 outline-none transition-colors hover:bg-muted/20 focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(170px,.8fr)_minmax(180px,1fr)_auto] sm:items-center">
          <div className="flex items-center gap-3"><Icon className="size-4 shrink-0 text-muted-foreground"/><div><p className="text-sm font-medium">{domain.title}</p><p className="text-xs text-muted-foreground">{n(coverage.evidenceCount)} {domain.unit}{coverage.dataThrough?` · corte ${date(coverage.dataThrough)}`:''}</p></div></div>
          <p className="text-xs leading-5 text-muted-foreground line-clamp-2">{coverage.note}</p>
          <div className="flex items-center gap-3 sm:justify-end"><span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.08em] ${meta.className}`}><StatusIcon className="size-3"/>{meta.label}</span><span className="text-xs text-muted-foreground">{coverage.reviewCount>0?`${n(coverage.reviewCount)} revisión`:'Sin revisión'}</span><ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"/></div>
        </Link>;
      })}
    </div>

    <div className="grid gap-3 lg:grid-cols-[0.8fr_1.2fr]">
      <div className="rounded-lg border bg-card px-4 py-3"><div className="flex items-center gap-3">{qualityOk?<CheckCircle2 className="h-4 w-4"/>:<AlertTriangle className="h-4 w-4"/>}<div><p className="text-sm font-medium">Calidad de datos · {data.quality.pass} PASS · {data.quality.hold} HOLD</p><p className="mt-1 text-xs text-muted-foreground">{n(data.quality.sourceFiles)} archivos fuente · {n(data.quality.sourceSheets)} hojas registradas · {n(data.quality.sourceAnomalies)} anomalías fuente</p></div></div></div>
      <div className="rounded-lg border bg-card px-4 py-3"><p className="text-sm font-medium">Revisiones de datos</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{reviewItems.join(' · ')}. Las colas pueden solaparse y no se suman como un único total.</p></div>
    </div>
  </section>;
}

function coverageStatus(status:'operational'|'partial'|'awaiting_source'){
  if(status==='operational') return {label:'Operativo',icon:CheckCircle2,className:'border-secondary/35 bg-secondary/10 text-secondary'};
  if(status==='partial') return {label:'Parcial',icon:AlertTriangle,className:'border-primary/35 bg-primary/10 text-primary'};
  return {label:'Sin fuente',icon:CircleDashed,className:'border-border bg-muted/40 text-muted-foreground'};
}

function Metric({icon:Icon,label,value,detail}:{icon:any;label:string;value:string;detail:string}){return <div className="bg-card px-5 py-4"><div className="flex items-center justify-between gap-3"><p className="text-xs text-muted-foreground">{label}</p><Icon className="h-4 w-4 text-muted-foreground"/></div><p className="mt-2 text-xl font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p></div>}
function Mini({label,value,detail}:{label:string;value:string;detail:string}){return <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold tracking-tight">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>}
function SignalIcon({level}:{level:'info'|'watch'|'alert'}){return level==='info'?<CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0"/>:<AlertTriangle className="mt-0.5 h-4 w-4 shrink-0"/>}
