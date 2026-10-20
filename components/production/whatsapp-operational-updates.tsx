'use client';

import {useState} from 'react';
import useSWR from 'swr';
import {Button} from '@/components/ui/button';
import type {
  WhatsappActivityMode,WhatsappActivityFeed,WhatsappActivityEvidence,
} from '@/lib/messages/whatsapp-operational-projection.mjs';

type Payload=WhatsappActivityFeed & {sourceLimitReached?:boolean};
const titles:Record<WhatsappActivityMode,string>={
  overview:'Novedades operacionales',
  plant:'Actividad reportada desde Planta Patagua',
  mine:'Novedades informadas desde mina',
  dispatch:'Coordinación de despachos informada',
  drilling:'Perforación y sondajes informados',
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
          Última actualización informada (WhatsApp): <span className="font-medium text-foreground">
            {isLoading?'Consultando…':when(data?.latestReportedAt)}
          </span>
        </p>
        <p className="text-xs text-muted-foreground">
          Novedades recibidas, no verificaciones en terreno. Se conservan separado el corte de
          los indicadores certificados y las órdenes de mantenimiento.
        </p>
      </div>
      <Button variant="outline" size="sm" disabled={isLoading}
        onClick={()=>void mutate()}>Actualizar novedades</Button>
    </div>
    {isLoading?<p role="status" className="text-sm text-muted-foreground">Leyendo fuentes de WhatsApp…</p>:null}
    {error?<p role="alert" className="text-sm text-destructive">{error.message}</p>:null}
    {!isLoading&&!error&&!data?.updates.length?
      <p className="text-sm text-muted-foreground">Sin novedades textuales verificables de fuentes autorizadas para esta área.</p>:null}
    {data?.sourceLimitReached?<p className="text-xs text-muted-foreground">
      Vista reciente limitada; los mensajes originales permanecen almacenados.
    </p>:null}
    {updates.length>0?<div className="space-y-3">
      {updates.map(item=><article key={item.id}
        className="rounded-xl border bg-background/60 p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-sm font-semibold leading-none">{item.groupName}</p>
            <p className="mt-1 text-xs text-muted-foreground">{item.destination}</p>
          </div>
          <time dateTime={item.reportedAt}
            className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
            {when(item.reportedAt)}
          </time>
        </div>
        <div className="rounded-lg border bg-card px-3 py-3 sm:px-4">
          {item.text.length>480?<details className="space-y-2">
            <summary className="cursor-pointer list-none whitespace-pre-wrap break-words text-sm leading-relaxed">
              {item.text.slice(0,280)}…
              <span className="ml-1 text-xs font-medium underline underline-offset-2">
                Ver mensaje completo
              </span>
            </summary>
            <p className="whitespace-pre-wrap break-words border-t pt-3 text-sm leading-relaxed">
              {item.text}
            </p>
          </details>:<p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{item.text}</p>}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <span className={"inline-flex rounded-full border px-2 py-0.5 font-medium "+
            (item.reportedState==='pending'?'border-destructive/30 text-destructive':
             item.reportedState==='reported_done'?'border-border text-foreground':
             'border-border')}>
            {reportedStateLabel[item.reportedState]||'Estado por corroborar'}
          </span>
          <span>Mensaje #{item.sourceMessageId}</span>
          {item.partial?<span>Reporte compuesto · adjuntos no certifican cada actividad</span>:null}
        </div>
        {item.sourceEvidence.length>0?<div className="mt-3">
          <p className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Evidencia adjunta
          </p>
          <div className="flex flex-wrap gap-2">
            {item.sourceEvidence.map(file=><EvidenceLink key={file.id} file={file} mode={mode}/>)}
          </div>
        </div>:null}
      </article>)}
    </div>:null}
    {data&&(data.updates.length>5)?<Button variant="outline" size="sm"
      onClick={()=>setExpanded(v=>!v)}>
      {expanded?'Mostrar menos': 'Ver '+data.updates.length+' novedades'}
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
