'use client';

import useSWR from 'swr';
import { AlertTriangle, FileSearch, FlaskConical, ListChecks } from 'lucide-react';
import { StatePanel } from '@/components/ui/state-panel';

type Hole360Data = {
  hole: { id:string; hole_code:string; source_type:string|null; source_reference:string|null };
  profile: {
    mine_name:string|null; sector_name:string|null; orientation_confidence:string|null;
    raw_inclination_conflict:boolean|null; deterministic_gap_count:number|null;
    recommended_action:string|null; source_reference:string|null;
    operational_geology_evidence_count:number|null;
    topography_evidence_count:number|null; survey_evidence_count:number|null;
  }|null;
  immediateTasks: Array<{
    task_category:string; task_title:string; clarifying_question:string; recommended_action:string;
    human_checkpoint:string; evidence_summary:string; last_evidence_date:string|null;
  }>;
  recentSourceReports: Array<{
    id:string; operation_date:string|null; source_file:string|null; source_sheet:string|null; source_row:number|null;
    meter_initial:number|null; meter_final:number|null; drilled_meters:number|null;
    drilling_observations:string|null; reconciliation_status:string|null;
  }>;
  latestSourceDate:string|null;
  linkedSamples:Array<{ id:string; sample_code:string; sample_date:string|null; validation_status:string|null; source_file:string|null }>;
  linkedAssays:Array<{
    sample_id:string; analyte_code:string; result_value:number|null; result_unit:string|null;
    validation_status:string|null; result_date:string|null; laboratory:string|null;
  }>;
};

const fetcher=async(url:string):Promise<Hole360Data>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const body=await response.json();
  if(!response.ok)throw new Error(body.error||'No fue posible abrir el expediente geológico');
  return body;
};
const formatDate=(date:string|null|undefined)=>{
  if(!date)return 'Sin fecha';
  const parsed=new Date(date.slice(0,10)+'T12:00:00');
  return Number.isNaN(parsed.getTime())?'Fecha no válida':parsed.toLocaleDateString('es-CL');
};
function Fact({label,value}:{label:string;value:string|number}){
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}

export function GeologiaHole360({holeId}:{holeId:string}){
  const {data,error,isLoading}=useSWR<Hole360Data>(
    holeId?'/api/produccion/geologia/hole-360?holeId='+encodeURIComponent(holeId):null,
    fetcher,
    {revalidateOnFocus:false},
  );
  if(!holeId)return null;
  if(error)return <StatePanel tone="error" title="No se pudo cargar la Ficha 360" description="El expediente principal permanece disponible; no se presentan datos parciales como verificados." className="min-h-0 py-5"/>;
  if(isLoading||!data)return <StatePanel title="Cargando Ficha 360" description="Leyendo evidencia fuente y revisiones asociadas al sondaje." className="min-h-0 py-5"/>;

  const {hole,profile,immediateTasks,recentSourceReports,linkedSamples,linkedAssays}=data;
  return <section aria-label={'Ficha 360 del sondaje '+hole.hole_code} className="space-y-4">
    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-start gap-2"><FileSearch className="mt-0.5 h-4 w-4 text-muted-foreground"/><div><h3 className="font-semibold">Ficha 360 · {hole.hole_code}</h3><p className="mt-1 text-sm text-muted-foreground">Expediente operativo y evidencia verificable del sondaje. No constituye interpretación geológica aprobada.</p></div></div>
      <div className="mt-4 grid gap-4 border-t pt-4 sm:grid-cols-2">
        <Fact label="Mina" value={profile?.mine_name||'Sin vínculo acreditado'}/>
        <Fact label="Sector" value={profile?.sector_name||'Sin vínculo acreditado'}/>
        <Fact label="Último reporte vinculado" value={formatDate(data.latestSourceDate)}/>
        <Fact label="Orientación" value={profile?.orientation_confidence||'No verificada'}/>
        <Fact label="Observaciones operacionales" value={profile?.operational_geology_evidence_count??'Sin evidencia estructurada'}/>
        <Fact label="Documento de procedencia" value={profile?.source_reference||hole.source_reference||hole.source_type||'No informado'}/>
      </div>
      {profile?.raw_inclination_conflict?<p className="mt-4 flex items-start gap-2 text-sm"><AlertTriangle className="h-4 w-4 shrink-0"/>La inclinación registrada contiene evidencia contradictoria. Requiere revisión humana.</p>:null}
    </div>

    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2"><ListChecks className="h-4 w-4"/><h3 className="font-semibold">Trabajo del geólogo</h3></div>
      <p className="mt-1 text-xs text-muted-foreground">Sólo acciones específicas respaldadas por evidencia; no se crean tareas automáticamente por datos ausentes en la fuente histórica.</p>
      {immediateTasks.length?<div className="mt-4 divide-y border-t">{immediateTasks.map((task,index)=><div key={task.task_category+'-'+index} className="py-3">
        <p className="font-medium text-sm">{task.task_title}</p>
        <p className="mt-1 text-sm">{task.clarifying_question}</p>
        <p className="mt-2 text-xs text-muted-foreground">Acción: {task.recommended_action}</p>
        <p className="mt-1 text-xs text-muted-foreground">Validación: {task.human_checkpoint}</p>
        <p className="mt-1 text-xs text-muted-foreground">Evidencia: {task.evidence_summary} · {formatDate(task.last_evidence_date)}</p>
      </div>)}</div>:<p className="mt-4 text-sm text-muted-foreground">No hay tareas inmediatas acreditadas para este sondaje.</p>}
      {profile?.recommended_action?<p className="mt-3 border-t pt-3 text-xs text-muted-foreground">Orientación de revisión del expediente: {profile.recommended_action}. Esta indicación no autoriza correcciones ni aprobaciones automáticas.</p>:null}
    </div>

    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold">Últimos reportes fuente</h3>
      <p className="mt-1 text-xs text-muted-foreground">Documentos operacionales vinculados al pozo, ordenados por fecha; no equivalen a logging geológico formal.</p>
      {recentSourceReports.length?<div className="mt-4 divide-y border-t">{recentSourceReports.map(report=><div key={report.id} className="py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="font-medium">{formatDate(report.operation_date)} · {report.source_file||'Fuente sin nombre'}</p><p className="text-xs text-muted-foreground">{report.reconciliation_status||'Sin reconciliación'}</p></div>
        <p className="mt-1 text-xs text-muted-foreground">Hoja {report.source_sheet||'—'} · fila {report.source_row??'—'} · metraje reportado {report.drilled_meters??'—'} m</p>
        {report.drilling_observations?<p className="mt-2 whitespace-pre-wrap text-xs">{report.drilling_observations}</p>:null}
      </div>)}</div>:<p className="mt-4 text-sm text-muted-foreground">Sin reportes fuente vinculados explícitamente al sondaje.</p>}
    </div>

    <div className="rounded-lg border bg-card p-5">
      <div className="flex items-center gap-2"><FlaskConical className="h-4 w-4"/><h3 className="font-semibold">Muestras y ensayes</h3></div>
      <p className="mt-1 text-xs text-muted-foreground">Sólo resultados enlazados mediante la identificación canónica de la muestra. La mineralización visual no se convierte en ley.</p>
      {linkedSamples.length?<div className="mt-4 divide-y border-t">{linkedSamples.map(sample=><div key={sample.id} className="py-3 text-sm">
        <p className="font-medium">{sample.sample_code} · {formatDate(sample.sample_date)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Estado {sample.validation_status||'Sin validar'} · {sample.source_file||'Sin documento fuente'}</p>
        {linkedAssays.filter(a=>a.sample_id===sample.id).map((assay,i)=><p key={i} className="mt-1 text-xs">{assay.analyte_code}: {assay.result_value??'Sin valor'} {assay.result_unit||''} · {assay.validation_status||'Sin validar'} · {assay.laboratory||'Laboratorio no informado'}</p>)}
      </div>)}</div>:<p className="mt-4 text-sm text-muted-foreground">Sin muestras químicas vinculadas explícitamente a este sondaje. Los resultados históricos de proceso permanecen separados.</p>}
    </div>
  </section>;
}
