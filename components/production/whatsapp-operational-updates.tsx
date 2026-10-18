'use client';

import {useState} from 'react';
import useSWR from 'swr';
import {Button} from '@/components/ui/button';
import type {
  WhatsappActivityMode,WhatsappActivityFeed,WhatsappActivityEvidence,
} from '@/lib/messages/whatsapp-operational-projection.mjs';

type Payload=WhatsappActivityFeed & {sourceLimitReached?:boolean};
const titles:Record<WhatsappActivityMode,string>={
  overview:'Actividad diaria',
  plant:'Actividad diaria de planta',
  mine:'Actividad diaria de mina',
  dispatch:'Programación diaria de despachos',
  drilling:'Actividad diaria de perforación',
};
const when=(date:string|null|undefined)=>{
  if(!date)return 'Sin fecha informada';
  const parsed=new Date(date);
  return Number.isNaN(parsed.getTime())?'Fecha sin resolver':
    parsed.toLocaleString('es-CL',{timeZone:'America/Santiago',
      day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'});
};
const reportedStateLabel:Record<string,string>={
  reported_done:'Reportado como realizado',
  pending:'Reportado pendiente',
  planned:'Reportado planificado',
  unclear:'Estado por corroborar',
};
const fetcher=async(url:string):Promise<Payload>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const payload=await response.json().catch(()=>null);
  if(!response.ok||!payload?.updates||!Array.isArray(payload.updates))
    throw new Error(payload?.error||'No se pudieron consultar las novedades.');
  return payload;
};

function EvidenceLink({file,mode}:{file:WhatsappActivityEvidence;mode:WhatsappActivityMode}){
  const href='/api/produccion/whatsapp-evidence/'+encodeURIComponent(file.id)+
    '?mode='+encodeURIComponent(mode);
  return <a className="inline-flex items-center rounded-md border px-2.5 py-1.5 text-xs underline underline-offset-2 hover:bg-muted"
      target="_blank" rel="noopener noreferrer" href={href}>
    {file.label}
    {file.association==='mismo_remitente_y_intervalo'?' · Cercano al reporte':
      file.association==='adjunto_de_reporte'?' · Adjunto al reporte':''}
  </a>;
}

export function WhatsappOperationalUpdates({mode='overview'}:{mode?:WhatsappActivityMode}){
  const [expanded,setExpanded]=useState(false);
  const {data,error,isLoading,mutate}=useSWR<Payload>(
    '/api/produccion/whatsapp-activity?mode='+encodeURIComponent(mode),
    fetcher,{refreshInterval:60000,revalidateOnFocus:true});
  const updates=expanded?data?.updates||[]:(data?.updates||[]).slice(0,5);
  return <section aria-label={titles[mode]} className="space-y-3 rounded-lg border bg-card p-4 sm:p-5">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-base font-semibold">{titles[mode]}</h2>
        <p className="text-sm text-muted-foreground">
          Último mensaje recibido: <span className="font-medium text-foreground">
            {isLoading?'Consultando…':when(data?.latestReportedAt)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Mensajes recibidos, no verificaciones en terreno. Se conservan separado el corte de
          los indicadores certificados y las órdenes de mantenimiento.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={isLoading}
        onClick={()=>void mutate()}>Actualizar actividad</Button>
    </div>
    {isLoading?<p role="status" className="text-sm text-muted-foreground">Leyendo fuentes de WhatsApp…</p>:null}
    {error?<p role="alert" className="text-sm text-destructive">{error.message}</p>:null}
    {!isLoading&&!error&&!data?.updates.length?
      <p className="text-sm text-muted-foreground">Sin mensajes recientes de las fuentes autorizadas para esta área.</p>:null}
    {data?.sourceLimitReached?<p className="text-xs text-muted-foreground">
      Vista reciente limitada; los mensajes originales permanecen almacenados.
    </p>:null}
    {updates.length>0?<div className="divide-y rounded-md border">
      {updates.map(item=><article key={item.id} className="space-y-2 px-3 py-3 text-sm">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>{item.groupName} · {item.destination}</span>
          <time dateTime={item.reportedAt}>{when(item.reportedAt)}</time>
        </div>
        {item.text.length>480?<details className="space-y-2">
          <summary className="cursor-pointer whitespace-pre-wrap break-words leading-relaxed">
            {item.text.slice(0,280)}… <span className="underline underline-offset-2">Leer reporte completo</span>
          </summary>
          <p className="whitespace-pre-wrap break-words pt-2 leading-relaxed">{item.text}</p>
        </details>:<p className="whitespace-pre-wrap break-words leading-relaxed">{item.text}</p>}
        <p className="text-xs text-muted-foreground">
          {reportedStateLabel[item.reportedState]||'Estado por corroborar'}
          {' · '}Mensaje #{item.sourceMessageId}
          {item.partial?' · Parte de un reporte con varias actividades; los adjuntos no certifican cada tarea':''}
        </p>
        {item.sourceEvidence.length>0?<div className="flex flex-wrap gap-2">
          {item.sourceEvidence.map(file=><EvidenceLink key={file.id} file={file} mode={mode}/>)}
        </div>:null}
      </article>)}
    </div>:null}
    {data&&(data.updates.length>5)?<Button variant="outline" size="sm"
      onClick={()=>setExpanded(v=>!v)}>
      {expanded?'Mostrar menos': 'Ver '+data.updates.length+' registros'}
    </Button>:null}
    {data?.unassignedVideos?.length?<details className="rounded-md border px-3 py-2">
      <summary className="cursor-pointer text-sm font-medium">
        Videos del turno sin actividad específica confirmada ({data.unassignedVideos.length})
      </summary>
      <p className="my-2 text-xs text-muted-foreground">
        Se preservan como evidencia del grupo. Coinciden temporalmente con varias
        novedades; no se atribuyen a una tarea concreta sin confirmación.
      </p>
      <div className="flex flex-wrap gap-2">
        {data.unassignedVideos.map(file=><div key={file.id} className="space-y-1 rounded-md border p-2">
          <p className="text-xs text-muted-foreground">{file.groupName} · {when(file.reportedAt)}</p>
          <EvidenceLink file={file} mode={mode}/>
        </div>)}
      </div>
    </details>:null}
  </section>;
}
