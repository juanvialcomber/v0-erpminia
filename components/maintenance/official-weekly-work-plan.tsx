'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { apiFetch } from '@/lib/api-client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

type OfficialSource = {id:string; mine:string;source_file:string; week_start:string;week_end:string;source_url:string|null};
type OfficialWork = {id:string;source_id:string;source_row:number;planned_date:string|null;assigned_name:string|null;asset_label:string;canonical_asset_id:string|null;title:string;priority_raw:string|null;planned_hours:number|null;source_status:string|null;reconciliation_status:string;review_reason:string|null;linked_work_order_id:string|null;};
type Response = {sources:OfficialSource[];items:OfficialWork[];summary:{total:number;review:number;completedReported:number;linkedOrders:number;plannedHours:number};officialMaster:{source:string;p1:number;p2:number;pending:Array<{sourceRow:number;mine:string;assetName:string;priority:string;matched:boolean}>};authority:string};
const fetcher=async(url:string):Promise<Response>=>{const r=await apiFetch(url);const d=await r.json();if(!r.ok)throw new Error(d?.error||'No disponible');return d;};

export function OfficialWeeklyWorkPlan(){
 const {data,error,isLoading,mutate}=useSWR<Response>('/api/maintenance/official-weekly-plan',fetcher,{revalidateOnFocus:false});
 return <section className="space-y-4" aria-label="Programas oficiales">
  <div className="flex items-center justify-between gap-3">
   <div><h2 className="text-lg font-semibold">Trabajos por faena</h2><p className="text-sm text-muted-foreground">Fuente oficial de Ariel. No crea ni cierra órdenes automáticamente.</p></div>
   <Button variant="outline" size="sm" onClick={()=>void mutate()} disabled={isLoading}>Actualizar</Button>
  </div>
  {error?<p role="alert" className="text-sm text-destructive">{error.message}</p>:null}
  {isLoading?<div className="h-24 animate-pulse rounded-lg bg-muted"/>:null}
  {!isLoading&&!error&&data?.items.length===0?<Card><CardContent className="p-6 text-sm text-muted-foreground">Sin programas semanales oficiales activos. Se conserva la evidencia histórica y la planificación preventiva.</CardContent></Card>:null}
  {data?.officialMaster?<div className="rounded-lg border p-4 space-y-2"><h3 className="font-semibold">Prioridades del maestro</h3><p className="text-sm">{data.officialMaster.p1} P1 vencidas · {data.officialMaster.p2} P2 inmediatas · fuente: {data.officialMaster.source}</p>{data.officialMaster.pending.length>0?<div className="space-y-1"><p className="text-xs text-muted-foreground">Pendientes de vincular (se mantienen visibles)</p>{data.officialMaster.pending.map(row=><p key={row.sourceRow} className="text-xs"><Badge variant="outline">{row.priority}</Badge> {row.mine} · {row.assetName}</p>)}</div>:null}</div>:null}
  {data&&data.items.length>0?<div className="space-y-3">
   <div className="flex flex-wrap gap-3 text-xs text-muted-foreground"><span>{data.summary.total} actividades</span><span>{data.summary.plannedHours.toLocaleString('es-CL')} HH planificadas</span><span>{data.summary.review} por revisar</span><span>{data.summary.linkedOrders} vinculadas a OT</span></div>
   {data.sources.map(source=><Card key={source.id} className="shadow-none"><CardContent className="p-4 space-y-3">
    <div className="flex flex-wrap justify-between gap-2"><div><h3 className="font-semibold">{source.mine}</h3><p className="text-xs text-muted-foreground">{source.week_start} — {source.week_end} · {source.source_file}</p></div>{source.source_url?<a className="text-sm underline" href={source.source_url} target="_blank" rel="noreferrer">Ver fuente</a>:null}</div>
    <div className="divide-y">
     {data.items.filter(item=>item.source_id===source.id).map(item=><div key={item.id} className="py-3 flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
      <div className="min-w-0 space-y-1">
       <div className="flex flex-wrap gap-2"><Badge variant="outline">{item.source_status||'Sin estado'}</Badge><Badge variant="outline">{item.reconciliation_status==='matched'?'Equipo vinculado':'Revisar identidad'}</Badge>{item.priority_raw?<Badge variant="secondary">{item.priority_raw}</Badge>:null}</div>
       <p className="text-sm font-medium">{item.title}</p>
       <p className="text-xs text-muted-foreground">{item.planned_date||'Sin fecha'} · {item.asset_label} · {item.assigned_name||'Sin responsable'} · {item.planned_hours??'—'} HH · Fila {item.source_row}</p>
      </div>
      <div className="shrink-0">{item.linked_work_order_id?<Button asChild variant="outline" size="sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${item.linked_work_order_id}`}>Abrir OT</Link></Button>:<span className="text-xs text-muted-foreground">{item.canonical_asset_id?'Pendiente de programar':'Vincular equipo'}</span>}</div>
     </div>)}
    </div>
   </CardContent></Card>)}
  </div>:null}
 </section>;
}
