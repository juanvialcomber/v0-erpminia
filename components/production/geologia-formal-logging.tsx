'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type Interval = {
  id:string;from_m:number;to_m:number;observed_on:string;source_reference:string;
  lithology:string|null;alteration:string|null;mineralization:string|null;structures:string|null;
  recovery_pct:number|null;rqd_pct:number|null;field_notes:string|null;status:string;
  created_by:string;reviewer_comment:string|null;reviewed_at:string|null;
};
type Response={
  available:boolean;canWrite:boolean;hole:{id:string;hole_code:string;drilled_depth_m:number|null};
  rows:Interval[];events:Array<{event_type:string;created_at:string;actor_id:string}>;
};
const fetcher=async(url:string):Promise<Response>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const json=await response.json();
  if(!response.ok)throw new Error(json.error||'No se pudo cargar el registro formal');
  return json;
};
const endpoint='/api/produccion/geologia/formal-intervals';
const initial={
  fromM:'',toM:'',observedOn:'',sourceReference:'',
  lithology:'',alteration:'',mineralization:'',structures:'',recoveryPct:'',rqdPct:'',field_notes:'',
};
const statusLabel:Record<string,string>={draft:'Borrador',submitted:'En revisión',validated:'Validado',rejected:'Rechazado'};
const formFields=[
  ['lithology','Litología'],['alteration','Alteración'],['mineralization','Mineralización'],
  ['structures','Estructuras'],['field_notes','Observaciones de terreno'],
] as const;

export function GeologiaFormalLogging({holeId}:{holeId:string}) {
  const url=holeId?endpoint+'?holeId='+encodeURIComponent(holeId):null;
  const {data,error,isLoading,mutate}=useSWR<Response>(url,fetcher,{revalidateOnFocus:false});
  const [form,setForm]=useState(initial);
  const [saving,setSaving]=useState(false);
  const [busyId,setBusyId]=useState<string|null>(null);
  const [reviewComments,setReviewComments]=useState<Record<string,string>>({});
  const set=(key:keyof typeof initial,value:string)=>setForm(old=>({...old,[key]:value}));

  async function mutateInterval(body:Record<string,unknown>,method:'POST'|'PATCH'){
    const response=await fetch(endpoint,{method,credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify(body)});
    const payload=await response.json().catch(()=>null);
    if(!response.ok)throw new Error(payload?.error||'No fue posible registrar el cambio');
    await mutate();
  }
  async function createDraft() {
    if(!holeId)return;
    setSaving(true);
    try {
      await mutateInterval({
        ...form,holeId,
        field_notes:form.field_notes,
        fromM:form.fromM,toM:form.toM,
        recoveryPct:form.recoveryPct,rqdPct:form.rqdPct,
      },'POST');
      setForm(initial);
      toast.success('Borrador geológico guardado; pendiente de revisión profesional.');
    } catch(reason) {toast.error(reason instanceof Error?reason.message:'No fue posible guardar');}
    finally {setSaving(false);}
  }
  async function transition(intervalId:string,status:'submitted'|'validated'|'rejected'|'draft'){
    setBusyId(intervalId);
    try {
      await mutateInterval({intervalId,holeId,status,reviewerComment:reviewComments[intervalId]||''},'PATCH');
      toast.success(status==='validated'?'Intervalo validado':status==='rejected'?'Intervalo rechazado':'Estado actualizado');
    } catch(reason){toast.error(reason instanceof Error?reason.message:'No fue posible actualizar');}
    finally{setBusyId(null);}
  }

  return <section className="space-y-4" aria-label="Registro geológico formal">
    <div className="rounded-lg border bg-card p-5">
      <h3 className="font-semibold">Registro geológico formal</h3>
      <p className="mt-1 text-sm text-muted-foreground">Registra intervalos observados en terreno. Cada registro conserva su referencia documental y pasa por revisión de otro profesional antes de validarse. No altera los reportes de perforación.</p>
    </div>
    {error?<StatePanel tone="error" title="Registro formal no disponible" description={error instanceof Error?error.message:'No se pudo leer la base de registros. Los reportes de perforación siguen intactos.'} className="min-h-0 py-5"/>:null}
    {isLoading?<StatePanel title="Leyendo registros geológicos" description="Consultando borradores y observaciones validadas del sondaje." className="min-h-0 py-5"/>:null}
    {data?<div className="space-y-4">
      <div className="rounded-lg border bg-card p-5">
        <p className="font-medium">Intervalos documentados: {data.rows.length}</p>
        {data.rows.length?<div className="mt-3 divide-y">{data.rows.map(row=><article key={row.id} className="py-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm font-semibold">{Number(row.from_m).toLocaleString('es-CL')}–{Number(row.to_m).toLocaleString('es-CL')} m</p>
            <span className="rounded-full border px-2.5 py-1 text-xs">{statusLabel[row.status]||row.status}</span>
          </div>
          <p className="mt-2 text-xs text-muted-foreground">Fuente: {row.source_reference} · {row.observed_on}</p>
          <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
            {formFields.map(([key,label])=>row[key]?<p key={key}><span className="text-muted-foreground">{label}: </span>{row[key]}</p>:null)}
            {row.recovery_pct!=null?<p>Recuperación: {row.recovery_pct}%</p>:null}
            {row.rqd_pct!=null?<p>RQD: {row.rqd_pct}%</p>:null}
          </div>
          {row.reviewer_comment?<p className="mt-3 text-xs text-muted-foreground">Revisión: {row.reviewer_comment}</p>:null}
          {data.canWrite&&row.status==='draft'?<div className="mt-3"><Button size="sm" disabled={busyId===row.id} onClick={()=>void transition(row.id,'submitted')}>Enviar a revisión</Button></div>:null}
          {data.canWrite&&row.status==='submitted'?<div className="mt-3 space-y-2">
            <label className="block text-xs text-muted-foreground" htmlFor={'review-'+row.id}>Comentario del revisor (obligatorio)</label>
            <textarea id={'review-'+row.id} value={reviewComments[row.id]||''} onChange={event=>setReviewComments(old=>({...old,[row.id]:event.target.value}))}
              className="min-h-20 w-full rounded-md border bg-background p-2 text-sm" maxLength={2000} placeholder="Describe la evidencia y el motivo de la decisión."/>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" disabled={busyId===row.id||!reviewComments[row.id]||reviewComments[row.id].trim().length<10}
                onClick={()=>void transition(row.id,'validated')}>Validar</Button>
              <Button size="sm" variant="outline" disabled={busyId===row.id||!reviewComments[row.id]||reviewComments[row.id].trim().length<10}
                onClick={()=>void transition(row.id,'rejected')}>Rechazar</Button>
              <Button size="sm" variant="ghost" disabled={busyId===row.id} onClick={()=>void transition(row.id,'draft')}>Devolver a borrador</Button>
            </div>
            <p className="text-xs text-muted-foreground">El creador del intervalo no puede aprobar ni rechazar su propio registro. El servidor verifica esta condición.</p>
          </div>:null}
        </article>)}</div>:<p className="mt-3 text-sm text-muted-foreground">No hay registros geológicos formales para este sondaje. La evidencia operacional sigue disponible por separado.</p>}
      </div>

      {data.canWrite?<form className="rounded-lg border bg-card p-5" onSubmit={event=>{event.preventDefault();void createDraft();}}>
        <h4 className="font-medium">Nuevo intervalo · borrador</h4>
        <p className="mt-1 text-xs text-muted-foreground">Completa sólo observaciones verificadas directamente, sin inferir ley ni continuidad geológica.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="text-xs text-muted-foreground">Desde (m)
            <input required inputMode="decimal" type="number" min="0" step="0.001" value={form.fromM} onChange={e=>set('fromM',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"/>
          </label>
          <label className="text-xs text-muted-foreground">Hasta (m)
            <input required inputMode="decimal" type="number" min="0" step="0.001" value={form.toM} onChange={e=>set('toM',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"/>
          </label>
          <label className="text-xs text-muted-foreground">Fecha de observación
            <input required type="date" value={form.observedOn} onChange={e=>set('observedOn',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"/>
          </label>
          <label className="text-xs text-muted-foreground">Referencia documental
            <input required minLength={3} maxLength={500} value={form.sourceReference} onChange={e=>set('sourceReference',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm" placeholder="Registro terreno, libro, hoja o documento"/>
          </label>
          {formFields.map(([key,label])=><label key={key} className="text-xs text-muted-foreground">{label}
            <input maxLength={2000} value={form[key]} onChange={e=>set(key,e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm" placeholder="No informado"/>
          </label>)}
          <label className="text-xs text-muted-foreground">Recuperación (%)
            <input type="number" min="0" max="100" step="0.001" value={form.recoveryPct} onChange={e=>set('recoveryPct',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"/>
          </label>
          <label className="text-xs text-muted-foreground">RQD (%)
            <input type="number" min="0" max="100" step="0.001" value={form.rqdPct} onChange={e=>set('rqdPct',e.target.value)} className="mt-1 block h-9 w-full rounded-md border bg-background px-3 text-sm"/>
          </label>
        </div>
        <Button type="submit" size="sm" className="mt-4" disabled={saving}>{saving?'Guardando…':'Guardar borrador'}</Button>
        <p className="mt-2 text-xs text-muted-foreground">Las muestras y resultados de laboratorio no se enlazan automáticamente a este intervalo.</p>
      </form>:<p className="text-xs text-muted-foreground">Acceso de consulta: sólo los cargos con permiso de edición pueden registrar o revisar intervalos.</p>}
    </div>:null}
  </section>;
}
