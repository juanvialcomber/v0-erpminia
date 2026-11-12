'use client';

import useSWR from 'swr';
import { AlertTriangle, Compass, FileSearch, MapPinned } from 'lucide-react';
import { StatePanel } from '@/components/ui/state-panel';

type ImmediateTask = {
  drill_hole_id:string;
  hole_code:string;
  task_priority:number;
  task_category:string;
  task_title:string;
  clarifying_question:string;
  recommended_action:string;
  human_checkpoint:string;
  evidence_summary:string;
};

type Response = {
  immediateTasks?:ImmediateTask[];
};

const fetcher=async(url:string):Promise<Response>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const data=await response.json();
  if(!response.ok)throw new Error(data.error||'No fue posible cargar las tareas geológicas inmediatas');
  return data;
};

const priorityLabel:Record<number,string>={0:'Crítica',1:'Alta',2:'Alta',3:'Media',4:'Media'};
const categoryLabel:Record<string,string>={
  measurement:'Medición',
  orientation_review:'Validar orientación',
  topography_recovery:'Recuperar Topografía',
  setup_recovery:'Recuperar setup',
  orientation_completion:'Completar orientación',
};

function Metric({label,value,icon:Icon}:{label:string;value:number;icon:typeof Compass}){
  return <div className="rounded-md border bg-card p-3"><Icon className="h-4 w-4 text-muted-foreground"/><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-0.5 text-xs text-muted-foreground">{label}</p></div>;
}

export function GeologiaImmediateTaskQueue(){
  const {data,error,isLoading}=useSWR<Response>('/api/produccion/geologia/canonical',fetcher,{revalidateOnFocus:false});
  if(error)return <StatePanel tone="error" title="No fue posible cargar las tareas geológicas inmediatas" description="Las otras revisiones siguen disponibles; esta cola no se muestra parcialmente." className="min-h-0 py-5"/>;
  if(isLoading||!data)return <StatePanel title="Leyendo tareas geológicas inmediatas" description="Consultando sólo casos 2026 con evidencia concreta y checkpoint humano." className="min-h-0 py-5"/>;

  const tasks=[...(data.immediateTasks||[])].sort((a,b)=>a.task_priority-b.task_priority||a.hole_code.localeCompare(b.hole_code,'es',{numeric:true}));
  const critical=tasks.filter((task)=>task.task_priority===0).length;
  const orientation=tasks.filter((task)=>task.task_category==='measurement'||task.task_category==='orientation_review'||task.task_category==='orientation_completion').length;
  const topography=tasks.filter((task)=>task.task_category==='topography_recovery').length;
  const setup=tasks.filter((task)=>task.task_category==='setup_recovery').length;

  return <section className="overflow-hidden rounded-lg border bg-card" aria-label="Tareas geológicas inmediatas 2026">
    <div className="border-b px-5 py-4">
      <p className="text-xs font-medium uppercase tracking-[0.16em] text-muted-foreground">Tareas geológicas inmediatas · 2026</p>
      <h2 className="mt-2 text-xl font-semibold tracking-tight">Casos con evidencia suficiente para una acción humana</h2>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Sólo aparecen mediciones, validaciones o recuperaciones respaldadas por una referencia concreta. No incluye ausencias masivas de collar, survey, logging ni química.</p>
    </div>

    <div className="grid gap-3 border-b p-4 sm:grid-cols-2 xl:grid-cols-4">
      <Metric label="Críticas" value={critical} icon={AlertTriangle}/>
      <Metric label="Orientación / medición" value={orientation} icon={Compass}/>
      <Metric label="Topografía por recuperar" value={topography} icon={MapPinned}/>
      <Metric label="Setup por recuperar" value={setup} icon={FileSearch}/>
    </div>

    {tasks.length?<div className="max-h-[620px] divide-y overflow-auto">
      {tasks.map((task)=><article key={`${task.drill_hole_id}-${task.task_category}`} className="grid gap-3 px-5 py-4 lg:grid-cols-[190px_minmax(0,1fr)_minmax(0,1fr)]">
        <div>
          <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{task.hole_code}</p><span className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground">{priorityLabel[task.task_priority]||'Revisión'}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{categoryLabel[task.task_category]||task.task_title}</p>
          <p className="mt-2 text-xs text-muted-foreground">{task.evidence_summary}</p>
          <a className="mt-2 inline-block text-xs font-medium underline underline-offset-2" href={'/dashboard/produccion/geologia?tab=holes&hole='+encodeURIComponent(task.drill_hole_id)}>Abrir Ficha 360</a>
        </div>
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Pregunta a resolver</p><p className="mt-1 text-sm font-medium">{task.clarifying_question}</p><p className="mt-2 text-xs text-muted-foreground">{task.human_checkpoint}</p></div>
        <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p><p className="mt-1 text-sm">{task.recommended_action}</p><p className="mt-2 text-xs text-muted-foreground">El resultado sólo se materializa después de recuperar evidencia primaria y validarla humanamente.</p></div>
      </article>)}
    </div>:<div className="px-5 py-8 text-center text-sm text-muted-foreground">No hay tareas geológicas inmediatas respaldadas por evidencia específica.</div>}
  </section>;
}
