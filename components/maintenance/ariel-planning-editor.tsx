'use client';
import {useState} from 'react';
import useSWR from 'swr';
import {toast} from 'sonner';
import {apiFetch} from '@/lib/api-client';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {Textarea} from '@/components/ui/textarea';
import {Select,SelectContent,SelectItem,SelectTrigger,SelectValue} from '@/components/ui/select';
import Link from 'next/link';

type Decision={id:string;source_kind:string;source_id:string;title:string;description:string|null;work_type:string;priority:string;scheduled_date:string|null;planned_duration_hours:number|null;assigned_person_id:string|null;decision_status:string;revision:number;linked_work_order_id:string|null};
type Person={id:string;full_name:string;role_title:string|null};
const fetcher=async(url:string)=>{const r=await apiFetch(url);const d=await r.json();if(!r.ok)throw Error(d.error||'No disponible');return d;};
type Props={sourceKind:'official_weekly'|'preventive_priority';sourceId:string;title:string;scheduledDate:string|null;plannedHours:number|null;priority:'low'|'medium'|'high'|'critical';workType:'preventive'|'corrective'|'general';canonicalAssetId:string|null;onFinished?:()=>void};
export function ArielPlanningEditor(props:Props){
 const {data:result,mutate}=useSWR<{decisions:Decision[];canWrite:boolean}>('/api/maintenance/planning-decisions',fetcher,{revalidateOnFocus:false});
 const {data:peopleData}=useSWR<{assignees:Person[]}>('/api/maintenance/assignees',fetcher,{revalidateOnFocus:false});
 const decision=result?.decisions.find(d=>d.source_kind===props.sourceKind&&d.source_id===props.sourceId);
 const [editing,setEditing]=useState(false);
 const [name,setName]=useState<string|null>(null),[description,setDescription]=useState<string|null>(null);
 const [date,setDate]=useState<string|null>(null),[hours,setHours]=useState<string|null>(null);
 const [priority,setPriority]=useState<string|null>(null),[workType,setWorkType]=useState<string|null>(null),[assigned,setAssigned]=useState<string|null>(null);
 const [busy,setBusy]=useState(false);
 const title=name??decision?.title??props.title;
 const scheduledDate=date??decision?.scheduled_date??props.scheduledDate??'';
 const duration=hours??String(decision?.planned_duration_hours??props.plannedHours??0);
 const prio=priority??decision?.priority??props.priority;
 const type=workType??decision?.work_type??props.workType;
 const assignedId=assigned??decision?.assigned_person_id??'';
 const desc=description??decision?.description??'';
 async function submit(action:'save'|'approve'){
  if(!props.canonicalAssetId){toast.error('Primero debe vincularse un equipo canónico');return;}
  if(action==='approve'&&!confirm('¿Aprobar esta planificación y generar su OT con los datos indicados?'))return;
  setBusy(true);
  try{
   const r=await apiFetch('/api/maintenance/planning-decisions',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({
     sourceKind:props.sourceKind,sourceId:props.sourceId,title,description:desc,scheduledDate,plannedHours:Number(duration),
     priority:prio,workType:type,assignedPersonId:assignedId,action,revision:decision?.revision,
   })});
   const body=await r.json().catch(()=>({}));
   if(!r.ok)throw Error(body.error||'No fue posible guardar la decisión');
   await mutate();
   if(action==='approve'&&body.workOrderId)toast.success('OT '+(body.workOrderNumber||'')+' generada para ejecución y aprobación de cierre');
   else if(action==='approve')toast.warning('Aprobada, pendiente de generar la OT');
   else toast.success('Planificación guardada');
   setEditing(false);props.onFinished?.();
  }catch(e){toast.error(e instanceof Error?e.message:'No fue posible guardar');await mutate();}
  finally{setBusy(false);}
 }
 if(decision?.decision_status==='generated'&&decision.linked_work_order_id)return <Button asChild size="sm" variant="outline"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${decision.linked_work_order_id}`}>Abrir OT</Link></Button>;
 if(!result?.canWrite)return <span className="text-xs text-muted-foreground">Solo lectura</span>;
 if(!editing)return <div className="flex flex-wrap gap-2"><Button size="sm" variant="outline" onClick={()=>setEditing(true)}>Editar propuesta</Button>{decision?.decision_status==='approved'?<span className="text-xs text-amber-600">Aprobada, OT pendiente</span>:null}</div>;
 return <div className="w-full space-y-3 rounded-lg border p-3">
  <div className="grid gap-2">
   <Label>Trabajo</Label><Input value={title} onChange={e=>setName(e.target.value)} maxLength={240}/>
   <Label>Descripción</Label><Textarea rows={2} value={desc} onChange={e=>setDescription(e.target.value)} />
  </div>
  <div className="grid grid-cols-2 gap-2">
   <div><Label>Fecha</Label><Input type="date" value={scheduledDate} onChange={e=>setDate(e.target.value)} /></div>
   <div><Label>HH planificadas</Label><Input type="number" min={0} max={240} step=".5" value={duration} onChange={e=>setHours(e.target.value)}/></div>
   <div><Label>Prioridad</Label><Select value={prio} onValueChange={setPriority}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent>{(['low','medium','high','critical'] as const).map(v=><SelectItem key={v} value={v}>{({low:'Baja',medium:'Media',high:'Alta',critical:'Crítica'} as const)[v]}</SelectItem>)}</SelectContent></Select></div>
   <div><Label>Tipo</Label><Select value={type} onValueChange={setWorkType}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="preventive">Preventiva</SelectItem><SelectItem value="corrective">Correctiva</SelectItem><SelectItem value="general">General</SelectItem></SelectContent></Select></div>
  </div>
  <Label>Ejecutor responsable</Label>
  <Select value={assignedId||undefined} onValueChange={setAssigned}><SelectTrigger><SelectValue placeholder="Elegir ejecutor"/></SelectTrigger><SelectContent>{(peopleData?.assignees||[]).map(p=><SelectItem key={p.id} value={p.id}>{p.full_name}</SelectItem>)}</SelectContent></Select>
  <p className="text-xs text-muted-foreground">La aprobación genera una OT abierta. Su ejecución y cierre siguen requiriendo validación del supervisor. La propuesta y el archivo de Ariel se conservan.</p>
  <div className="flex flex-wrap gap-2">
   <Button size="sm" variant="outline" disabled={busy} onClick={()=>void submit('save')}>Guardar cambios</Button>
   <Button size="sm" disabled={busy||!assignedId||!scheduledDate||!props.canonicalAssetId} onClick={()=>void submit('approve')}>Aprobar y generar OT</Button>
   <Button size="sm" variant="ghost" disabled={busy} onClick={()=>setEditing(false)}>Cancelar</Button>
  </div>
 </div>;
}
