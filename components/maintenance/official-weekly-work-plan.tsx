'use client';

import useSWR from 'swr';
import { useState } from 'react';
import Link from 'next/link';
import { ArielPlanningEditor } from './ariel-planning-editor';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { FileUp } from 'lucide-react';

type OfficialSource = {id:string; mine:string;source_file:string; week_start:string;week_end:string;source_url:string|null};
type OfficialWork = {id:string;source_id:string;source_row:number;planned_date:string|null;assigned_name:string|null;asset_label:string;canonical_asset_id:string|null;title:string;priority_raw:string|null;planned_hours:number|null;source_status:string|null;reconciliation_status:string;review_reason:string|null;linked_work_order_id:string|null;work_type_raw:string|null;};
type Response = {sources:OfficialSource[];items:OfficialWork[];summary:{total:number;review:number;completedReported:number;linkedOrders:number;plannedHours:number};officialMaster:{source:string;p1:number;p2:number;pending:Array<{sourceRow:number;mine:string;assetName:string;priority:string;matched:boolean}>};authority:string};
const fetcher=async(url:string):Promise<Response>=>{const r=await apiFetch(url);const d=await r.json();if(!r.ok)throw new Error(d?.error||'No disponible');return d;};

export function OfficialWeeklyWorkPlan(){
 const {data,error,isLoading,mutate}=useSWR<Response>('/api/maintenance/official-weekly-plan',fetcher,{revalidateOnFocus:false});
 const [uploading,setUploading]=useState(false);
 const [uploadMessage,setUploadMessage]=useState<string|null>(null);
 const uploadProgram=async(file:File)=>{
  setUploading(true);setUploadMessage(null);
  try{
   const form=new FormData();form.append('file',file);
   const response=await apiFetch('/api/maintenance/official-weekly-plan/import',{method:'POST',body:form});
   const payload=await response.json().catch(()=>null);
   if(!response.ok)throw new Error(payload?.error||'No se pudo incorporar el programa semanal');
   const mismatch=payload?.summary?.mismatch===true;
   setUploadMessage(mismatch
    ? `Programa incorporado con revisión pendiente: el resumen declara ${payload.summary.declared} actividades y el detalle contiene ${payload.summary.parsed}.`
    : `Programa incorporado: ${payload?.summary?.parsed||0} actividades · ${payload?.summary?.matched||0} equipos vinculados.`);
   await mutate();
  }catch(cause){setUploadMessage(cause instanceof Error?cause.message:'No se pudo incorporar el programa semanal');}
  finally{setUploading(false);}
 };
 return <section className="space-y-4" aria-label="Programas oficiales">
  <div className="flex items-center justify-between gap-3">
   <div><h2 className="text-lg font-semibold">Trabajos por faena</h2><p className="text-sm text-muted-foreground">Fuente oficial de Ariel. No crea ni cierra órdenes automáticamente.</p></div>
   <div className="flex flex-wrap gap-2">
    <label className="inline-flex h-9 cursor-pointer items-center justify-center rounded-md border bg-background px-3 text-sm font-medium shadow-sm hover:bg-accent hover:text-accent-foreground">
     <FileUp className="mr-2 h-4 w-4"/>{uploading?'Procesando…':'Cargar programa'}
     <input className="hidden" type="file" accept=".xls,.xlsx" disabled={uploading} onChange={(event)=>{const file=event.target.files?.[0];if(file)void uploadProgram(file);event.currentTarget.value='';}}/>
    </label>
    <Button variant="outline" size="sm" onClick={()=>void mutate()} disabled={isLoading}>Actualizar</Button>
   </div>
  </div>
  {uploadMessage?<p role="status" className="rounded-md border px-3 py-2 text-sm text-muted-foreground">{uploadMessage}</p>:null}
  {error?<p role="alert" className="text-sm text-destructive">{error.message}</p>:null}
  {isLoading?<div className="h-24 animate-pulse rounded-lg bg-muted"/>:null}
  {!isLoading&&!error&&data?.items.length===0?<Card><CardContent className="p-6 text-sm text-muted-foreground">Sin programas semanales oficiales activos. Se conserva la evidencia histórica y la planificación preventiva.</CardContent></Card>:null}
  {data?.officialMaster?<div className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">Prioridades del maestro</h3><p className="text-sm">{data.officialMaster.p1} P1 vencidas · {data.officialMaster.p2} P2 inmediatas · fuente: {data.officialMaster.source}</p>{data.officialMaster.pending.length>0?<div className="space-y-1"><p className="text-xs text-muted-foreground">Pendientes de vincular (se mantienen visibles)</p>{data.officialMaster.pending.map(row=><p key={row.sourceRow} className="text-xs"><Badge variant="outline">{row.priority}</Badge> {row.mine} · {row.assetName}</p>)}</div>:null}</div>:null}
  {data&&data.items.length>0?<div className="space-y-3">
   <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{data.summary.total} actividades</span><span>{data.summary.plannedHours.toLocaleString('es-CL')} HH planificadas</span><span>{data.summary.completedReported} reportadas terminadas</span><span>{data.summary.review} por revisar</span><span>{data.summary.linkedOrders} vinculadas a OT</span></div>
   {data.sources.map(source=><Card key={source.id} className="shadow-none"><CardContent className="p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{source.mine}</h3><p className="text-xs text-muted-foreground">{source.week_start} — {source.week_end} · {source.source_file}</p></div>{source.source_url?.startsWith('http')?<a className="text-sm underline" href={source.source_url} target="_blank" rel="noreferrer">Ver fuente</a>:source.source_url?.startsWith('storage:')?<span className="text-xs text-muted-foreground">Fuente preservada en MOTIL</span>:null}</div>
    <div className="divide-y">
     {data.items.filter(item=>item.source_id===source.id).sort((a,b)=>Number(String(a.source_status||'').trim().toLowerCase()==='terminado')-Number(String(b.source_status||'').trim().toLowerCase()==='terminado')||String(a.planned_date||'').localeCompare(String(b.planned_date||''))).map(item=><div key={item.id} className="py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
       <div className="flex flex-wrap gap-2"><Badge variant="outline">{item.source_status||'Sin estado'}</Badge><Badge variant="outline">{item.reconciliation_status==='matched'?'Equipo vinculado':'Revisar identidad'}</Badge>{item.priority_raw?<Badge variant="secondary">{item.priority_raw}</Badge>:null}</div>
       <p className="text-sm font-medium">{item.title}</p>
       <p className="text-xs text-muted-foreground">{item.planned_date||'Sin fecha'} · {item.asset_label} · {item.assigned_name||'Sin responsable'} · {item.planned_hours??'—'} HH · Fila {item.source_row}</p>
      </div>
      <div className="min-w-0 lg:max-w-sm">{!item.linked_work_order_id && String(item.source_status||'').trim().toLowerCase()!=='terminado' && <ArielPlanningEditor sourceKind="official_weekly" sourceId={item.id} title={item.title} scheduledDate={item.planned_date} plannedHours={item.planned_hours} priority={item.priority_raw?.toLowerCase().includes('alta')?'high':'medium'} workType={item.title.trim().toLowerCase()==='orden y aseo'?'general':item.work_type_raw?.toLowerCase().includes('correctiva')?'corrective':'preventive'} canonicalAssetId={item.canonical_asset_id} assignedName={item.assigned_name} onFinished={()=>void mutate()}/>} {item.linked_work_order_id?<Button asChild variant="outline" size="sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${item.linked_work_order_id}`}>Abrir OT</Link></Button>:String(item.source_status||'').trim().toLowerCase()==='terminado'?<span className="text-xs text-muted-foreground">Reportado terminado · revisar cierre</span>:<span className="text-xs text-muted-foreground">{item.canonical_asset_id?'Listo para revisión de Ariel':'Vincular equipo'}</span>}</div>
     </div>)}
    </div>
   </CardContent></Card>)}
  </div>:null}
 </section>;
}
