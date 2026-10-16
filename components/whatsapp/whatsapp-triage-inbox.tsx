'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

type Section = { id:string;label:string;total:number;uncovered:number };
type Proposal = {
  id:string;label:string;reason:string;reportedState:string;
  needsMediaReview:boolean;safetyReview:boolean;mixedClaim:boolean;confidence:string;
};
type SourceBlock = {
  lineStart:number;lineEnd:number;title:string;siteHint:string|null;
  excerpt:string;proposal:Proposal;reportedState:string;
  needsNumericalReview:boolean;multipleContexts:boolean;
};
type SourceAttachment = {
  id:string;download_status:string;scan_status:string;
  original_file_name?:string|null;mime_type?:string|null;
};
type SourceDetail = {
  id:number;groupName:string;body:string;bodyTruncated:boolean;
  attachments:SourceAttachment[];messageType:string;
};
type Message = {
  id:number;groupName:string;messageType:string;occurredAt?:string;
  siteHint:string|null;sections:SourceBlock[];
  excerpt:string;hasText:boolean;findingIndexes:number[];
  coverage:'referenced'|'not_extracted'|'media_pending';proposal:Proposal;
};
type Finding = {
  index:number;detail:string;groups:string[];sourceIds:number[];
  reviewStatus:string;sourceComplete:boolean;suggestion:Proposal;
};
type Triage = {
  reportDate:string;reportStatus:string;sourceCountAtReport:number;
  sourceCountNow:number;sourceMayHaveChanged:boolean;truncated:boolean;
  totals:{
    messages:number;withText:number;referencedMessages:number;
    uncoveredText:number;mediaWithoutText:number;mediaToReview:number;findings:number;multiSection:number;
  };
  bySection:Section[];
  items:Message[];findings:Finding[];
  possibleRepeats:{key:string;indices:number[]}[];
};
const stageLabel:Record<string,string>={
  referenced:'Citado por la IA',
  not_extracted:'Texto fuera del resumen',
  media_pending:'Sin texto utilizable',
};
const reviewLabel:Record<string,string>={
  pending:'Por corroborar',confirmed:'Contenido corroborado',
  needs_more_info:'Falta evidencia',dismissed:'Descartado',
};
const priority:Record<string,number>={not_extracted:0,referenced:1,media_pending:2};
const formatWhen=(value?:string)=>{
  if(!value)return 'Sin hora';
  const date=new Date(value);
  return Number.isNaN(date.getTime())?'Fecha sin resolver':
    date.toLocaleString('es-CL',{timeZone:'America/Santiago',
      day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'});
};

export function WhatsappTriageInbox({dates}:{dates:string[]}) {
  const [day,setDay]=useState(dates[0]||'');
  const [triage,setTriage]=useState<Triage|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [view,setView]=useState<'findings'|'sources'>('findings');
  const [coverage,setCoverage]=useState('all');
  const [section,setSection]=useState('all');
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(20);
  const [reloadCounter,setReloadCounter]=useState(0);
  const [sourceDetail,setSourceDetail]=useState<SourceDetail|null>(null);
  const [sourceLoading,setSourceLoading]=useState<number|null>(null);
  const [sourceError,setSourceError]=useState('');
  const [activeSource,setActiveSource]=useState<number|null>(null);

  useEffect(()=>{
    if(!day)return;
    setSourceDetail(null);setActiveSource(null);setSourceError('');
    const controller=new AbortController();
    async function load(){
      setBusy(true);setError('');setTriage(null);
      try{
        const response=await fetch('/api/admin/whatsapp/triage?date='+encodeURIComponent(day),{
          credentials:'include',cache:'no-store',signal:controller.signal,
        });
        const value=await response.json().catch(()=>null);
        if(!response.ok||!value?.totals)throw new Error(
          value?.error||'No se pudo ordenar la información del día.');
        if(!controller.signal.aborted)setTriage(value as Triage);
      }catch(cause){
        if(!controller.signal.aborted)setError(cause instanceof Error?cause.message:
          'Error consultando mensajes.');
      }finally{if(!controller.signal.aborted)setBusy(false)}
    }
    void load();
    return ()=>controller.abort();
  },[day,reloadCounter]);

  const filtered=useMemo(()=>{
    if(!triage)return {messages:[],findings:[]};
    const needle=query.trim().toLocaleLowerCase('es');
    const matching=(candidate:string)=>candidate.toLocaleLowerCase('es').includes(needle);
    const messages=triage.items.filter(item=>{
      if(section!=='all' && item.proposal.id!==section &&
          !item.sections.some(block=>block.proposal.id===section))return false;
      if(coverage!=='all'&&item.coverage!==coverage)return false;
      return !needle||matching(item.excerpt+' '+item.groupName+' '+item.proposal.label+' '+item.id);
    }).sort((a,b)=>(priority[a.coverage]??3)-(priority[b.coverage]??3)
      || String(a.occurredAt||'').localeCompare(String(b.occurredAt||'')));
    const findings=triage.findings.filter(item=>
      (section==='all'||item.suggestion.id===section)&&
      (!needle||matching(item.detail+' '+item.groups.join(' ')+' '+item.sourceIds.join(' ')))
    ).sort((a,b)=>a.index-b.index);
    return {messages,findings};
  },[triage,coverage,section,query]);

  function resetFilters(){setSection('all');setCoverage('all');setQuery('');setLimit(20)}
  async function loadFullSource(messageId:number){
    setActiveSource(messageId);setSourceDetail(null);setSourceError('');setSourceLoading(messageId);
    try{
      const response=await fetch('/api/admin/whatsapp/triage/message?date='+
        encodeURIComponent(day)+'&id='+encodeURIComponent(String(messageId)),{
        credentials:'include',cache:'no-store',
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok || !result?.id)throw new Error(result?.error||'No se pudo leer el mensaje original.');
      setSourceDetail(result as SourceDetail);
    }catch(cause){
      setSourceError(cause instanceof Error?cause.message:'No se pudo consultar el original.');
    }finally{setSourceLoading(null)}
  }
  if(!dates.length)return null;
  return <section className="space-y-4 border-t pt-5" aria-label="Bandeja de clasificación de WhatsApp">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">Bandeja de clasificación</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Destino sugerido por contenido y grupo. Ningún mensaje se convierte automáticamente
          en OT, cifra de producción, despacho ejecutado o incidente HSE.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="triage-date" className="text-xs text-muted-foreground">Informe</label>
        <select id="triage-date" className="h-9 rounded-md border bg-background px-3 text-sm"
          value={day} onChange={event=>{setDay(event.target.value);resetFilters()}}>
          {dates.map(date=><option value={date} key={date}>{date}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={()=>setReloadCounter(v=>v+1)}>Actualizar</Button>
      </div>
    </div>
    {busy?<p role="status" className="text-sm text-muted-foreground">Clasificando fuentes del día…</p>:null}
    {error?<p role="alert" className="rounded-md border p-3 text-sm text-destructive">{error}</p>:null}
    {triage?<>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {[
          [triage.totals.messages,'Mensajes recibidos'],
          [triage.totals.findings,'Hallazgos IA'],
          [triage.totals.uncoveredText,'Textos sin hallazgo'],
          [triage.totals.mediaWithoutText,'Mensajes sin texto'],
        ].map(([value,label])=><div key={label} className="rounded-lg border p-3">
          <p className="text-xl font-semibold tabular-nums">{value}</p>
          <p className="text-xs text-muted-foreground">{label}</p>
        </div>)}
      </div>
      {triage.sourceMayHaveChanged||triage.truncated ? <p className="rounded-md border p-3 text-xs text-muted-foreground">
        El conjunto disponible hoy puede no coincidir con el informe original
        ({triage.sourceCountAtReport} mensajes al generarse,
        {' '}{triage.sourceCountNow} en la consulta actual).
        {triage.truncated?' Se alcanzó el límite de lectura; faltan fuentes por revisar.':''}
        {' '}No asumir cobertura completa.
      </p>:null}
      <div className="space-y-2">
        <p className="text-xs font-medium text-muted-foreground">Destinos propuestos (no aplicados)</p>
        <div className="flex flex-wrap gap-2">
          {triage.bySection.map(item=><button key={item.id} type="button"
            onClick={()=>{setSection(section===item.id?'all':item.id);setLimit(20)}}
            aria-pressed={section===item.id}
            className={'rounded-md border px-3 py-1.5 text-xs transition-colors '+
              (section===item.id?'bg-muted font-semibold':'hover:bg-muted/40')}>
            {item.label} · {item.total}
          </button>)}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 border-t pt-3">
        <Button size="sm" variant={view==='findings'?'default':'outline'}
          onClick={()=>{setView('findings');setLimit(20)}}>Hallazgos ({triage.findings.length})</Button>
        <Button size="sm" variant={view==='sources'?'default':'outline'}
          onClick={()=>{setView('sources');setLimit(20)}}>Todos los mensajes ({triage.items.length})</Button>
        <div className="min-w-[170px] flex-1">
          <Input aria-label="Buscar por mensaje o actividad" value={query}
            onChange={event=>{setQuery(event.target.value);setLimit(20)}}
            placeholder="Buscar novedad o mensaje" />
        </div>
        {view==='sources'?<select aria-label="Cobertura de extracción" value={coverage}
          onChange={event=>{setCoverage(event.target.value);setLimit(20)}}
          className="h-9 rounded-md border bg-background px-2 text-sm">
          <option value="all">Todos los estados</option>
          <option value="not_extracted">Sin hallazgo IA</option>
          <option value="referenced">Citados por IA</option>
          <option value="media_pending">Sin texto</option>
        </select>:null}
        {(section!=='all'||coverage!=='all'||query)?<Button variant="ghost" size="sm"
          onClick={resetFilters}>Limpiar filtros</Button>:null}
      </div>
      {view==='findings' ? <>
        {triage.possibleRepeats.length?<p className="rounded-md border p-3 text-xs text-muted-foreground">
          Posibles menciones repetidas: {triage.possibleRepeats.map(x=>
            x.indices.map(i=>'#'+(i+1)).join(' y ')).join('; ')}.
          {' '}Reconciliar los mensajes antes de contar actividades distintas.
        </p>:null}
        <div className="divide-y rounded-lg border">
          {filtered.findings.slice(0,limit).map(item=><div key={item.index} className="space-y-1 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
              <span>#{item.index+1} · {item.suggestion.label}</span>
              <span>{reviewLabel[item.reviewStatus]||item.reviewStatus}</span>
            </div>
            <p className="text-sm">{item.detail}</p>
            <p className="text-xs text-muted-foreground">
              {item.groups.join(' / ')||'Origen por confirmar'} · Mensajes: {item.sourceIds.join(', ')}
              {!item.sourceComplete?' · Hay fuentes no recuperadas':''}
            </p>
          </div>)}
          {!filtered.findings.length?<p className="p-4 text-sm text-muted-foreground">
            No hay hallazgos que coincidan con los filtros.
          </p>:null}
        </div>
        <p className="text-xs text-muted-foreground">Para corroborar fuentes y registrar
          novedades, usa el panel «Novedades diarias» inmediatamente debajo.</p>
      </>:<div className="divide-y rounded-lg border">
        {filtered.messages.slice(0,limit).map(item=><details key={item.id} className="group p-3">
          <summary className="cursor-pointer list-none space-y-1">
            <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
              <span>{item.proposal.label} · {stageLabel[item.coverage]}</span>
              <span>{formatWhen(item.occurredAt)} · #{item.id}</span>
            </div>
            <p className="text-sm">{item.excerpt.slice(0,170)||
              'Archivo sin texto extraíble: revisar original antes de clasificar.'}
              {item.excerpt.length>170?'…':''}</p>
            <p className="text-xs text-muted-foreground">
              {item.groupName} {item.siteHint ? ' · ' + item.siteHint + ' (mencionada)' : ''}
              {item.proposal.needsMediaReview?' · Contiene multimedia':''}
              {item.proposal.safetyReview?' · Revisar posible riesgo':''}
              {item.proposal.mixedClaim?' · Incluye actividades y pendientes: separar':''}
              {item.sections.length>1?' · '+item.sections.length+' bloques distintos':''}
            </p>
          </summary>
          <div className="mt-3 space-y-2 border-t pt-3">
            <p className="whitespace-pre-wrap break-words text-sm">
              {item.excerpt||'No hay texto que permita inferir la actividad.'}
            </p>
            <p className="text-xs text-muted-foreground">{item.proposal.reason}</p>
            {item.findingIndexes.length?<p className="text-xs text-muted-foreground">
              Hallazgos que citan esta fuente: {item.findingIndexes.map(i=>'#'+(i+1)).join(', ')}.
              La cita no acredita que se haya extraído todo el contenido del mensaje.
            </p>:null}
            {item.sections.length>1?<div className="space-y-2">
              <p className="text-xs font-semibold">Bloques encontrados en el mensaje
                {' '}({item.sections.length}) · Sugerencias, no registros confirmados
              </p>
              {item.sections.map((block,i)=><div key={String(block.lineStart)+'-'+i}
                className="space-y-1 rounded-md border px-3 py-2">
                <p className="text-xs font-medium">{block.proposal.label}
                  {' · '}Líneas {block.lineStart}–{block.lineEnd}
                  {block.siteHint?' · '+block.siteHint:''}
                </p>
                <p className="text-xs text-muted-foreground">{block.title.slice(0,95)}</p>
                <p className="whitespace-pre-wrap break-words text-xs">{block.excerpt.slice(0,350)}</p>
                {block.needsNumericalReview?<p className="text-xs text-destructive">
                  Verificar formato y unidad de lectura de horómetro antes de utilizar cifras.
                </p>:null}
              </div>)}
            </div>:null}
            <div className="space-y-2">
              <Button variant="outline" size="sm" disabled={sourceLoading===item.id}
                onClick={()=>void loadFullSource(item.id)}>
                {sourceLoading===item.id?'Consultando…':'Ver mensaje completo y adjuntos'}
              </Button>
              {activeSource===item.id&&sourceError?<p role="alert" className="text-xs text-destructive">
                {sourceError}</p>:null}
              {activeSource===item.id&&sourceDetail?.id===item.id?<div className="space-y-2 rounded-md border p-3">
                <p className="text-xs font-semibold">Mensaje original #{item.id}</p>
                <p className="whitespace-pre-wrap break-words text-sm">{sourceDetail.body||
                  'El mensaje original no contiene texto. Consulta los archivos.'}</p>
                {sourceDetail.bodyTruncated?<p className="text-xs text-muted-foreground">
                  Texto demasiado extenso; se muestra un máximo de 20.000 caracteres.
                </p>:null}
                {sourceDetail.attachments.map(file=><div key={file.id}
                  className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span>{file.original_file_name||file.mime_type||'Archivo'} ·
                    {' '}{file.scan_status==='review_ready'?'Extraído: pendiente de revisión':
                      file.scan_status==='pending'?'Lectura pendiente':
                      file.scan_status==='manual'?'Revisión manual':
                      file.scan_status}
                  </span>
                  {file.download_status==='stored'?<a className="underline"
                    href={'/api/admin/whatsapp/evidence/'+encodeURIComponent(file.id)+'?file=1'}
                    target="_blank" rel="noopener noreferrer">Ver original</a>:null}
                </div>)}
              </div>:null}
            </div>
          </div>
        </details>)}
        {!filtered.messages.length?<p className="p-4 text-sm text-muted-foreground">
          No hay mensajes que coincidan con los filtros.
        </p>:null}
      </div>}
      {((view==='findings'?filtered.findings.length:filtered.messages.length)>limit) ?
        <Button variant="outline" size="sm" onClick={()=>setLimit(v=>v+20)}>
          Mostrar 20 más</Button>:null}
      <p className="text-xs text-muted-foreground">
        Clasificación provisional. El estado «reportado como realizado» refleja el texto,
        no verificación en terreno. Los mensajes sin texto requieren lectura de multimedia.
      </p>
    </>:null}
  </section>;
}
