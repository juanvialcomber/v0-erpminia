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
  const [view,setView]=useState<'findings'|'sources'>('sources');
  const [coverage,setCoverage]=useState('all');
  const [section,setSection]=useState('all');
  const [query,setQuery]=useState('');
  const [limit,setLimit]=useState(20);
  const [reloadCounter,setReloadCounter]=useState(0);
  const [sourceDetail,setSourceDetail]=useState<SourceDetail|null>(null);
  const [sourceLoading,setSourceLoading]=useState<number|null>(null);
  const [sourceError,setSourceError]=useState('');
  const [activeSource,setActiveSource]=useState<number|null>(null);
  const [decisionBusy,setDecisionBusy]=useState<number|null>(null);
  const [decisionError,setDecisionError]=useState('');

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
  async function decideFinding(index:number,decision:'approve'|'reject'){
    setDecisionBusy(index);setDecisionError('');
    try{
      const response=await fetch('/api/admin/whatsapp/triage/review',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({date:day,index,decision}),
      });
      const result=await response.json().catch(()=>null);
      if(!response.ok||!result?.ok)throw new Error(result?.error||'No se pudo guardar la decisión.');
      setTriage(current=>current?{
        ...current,
        findings:current.findings.map(item=>item.index===index?{
          ...item,reviewStatus:result.reviewStatus,
        }:item),
      }:current);
    }catch(cause){
      setDecisionError(cause instanceof Error?cause.message:'No se pudo guardar la decisión.');
    }finally{setDecisionBusy(null)}
  }

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
  return <section className="space-y-4 border-t pt-5" aria-label="WhatsApp IA">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="space-y-1">
        <h2 className="text-lg font-semibold">WhatsApp IA</h2>
        <p className="max-w-2xl text-sm text-muted-foreground">
          Mensajes operacionales de los grupos autorizados, ordenados para revisión.
          La IA clasifica y relaciona evidencia sin modificar datos canónicos.
        </p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor="triage-date" className="text-xs text-muted-foreground">Día</label>
        <select id="triage-date" className="h-9 rounded-md border bg-background px-3 text-sm"
          value={day} onChange={event=>{setDay(event.target.value);resetFilters()}}>
          {dates.map(date=><option value={date} key={date}>{date}</option>)}
        </select>
        <Button size="sm" variant="outline" disabled={busy}
          onClick={()=>setReloadCounter(v=>v+1)}>Actualizar</Button>
      </div>
    </div>

    {busy?<p role="status" className="text-sm text-muted-foreground">Leyendo mensajes del día…</p>:null}
    {error?<p role="alert" className="rounded-md border p-3 text-sm text-destructive">{error}</p>:null}

    {triage?<>
      <article className="rounded-lg border bg-card">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
          <div>
            <p className="font-medium">{triage.reportDate}</p>
            <p className="text-xs text-muted-foreground">
              {triage.totals.messages} mensajes · {triage.totals.findings} actividades detectadas
              {triage.totals.mediaWithoutText ? ` · ${triage.totals.mediaWithoutText} sin texto` : ''}
            </p>
          </div>
          <p className="text-xs text-muted-foreground">
            {triage.reportStatus==='ready'?'Actualizado':
              triage.reportStatus==='partial'?'Datos parciales':
              triage.reportStatus==='processing'?'Procesando':triage.reportStatus}
          </p>
        </div>

        {triage.sourceMayHaveChanged||triage.truncated ? <p className="mx-4 mt-3 rounded-md border p-3 text-xs text-muted-foreground">
          La fuente disponible puede haber cambiado desde el informe original
          ({triage.sourceCountAtReport} mensajes al generarse, {triage.sourceCountNow} ahora).
          {triage.truncated?' La lectura está limitada; no asumir cobertura completa.':''}
        </p>:null}

        <div className="space-y-4 px-4 py-4">
          {triage.possibleRepeats.length?<p className="text-xs text-muted-foreground">
            Posibles menciones repetidas: {triage.possibleRepeats.map(x=>
              x.indices.map(i=>'#'+(i+1)).join(' y ')).join('; ')}. Revisar antes de contarlas como actividades distintas.
          </p>:null}

          {triage.findings.length ? triage.findings.map(item=>
            <div key={item.index} className="border-l-2 border-border pl-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm">
                  <span className="font-medium">{item.suggestion.label}: </span>{item.detail}
                </p>
                <span className="shrink-0 text-xs text-muted-foreground">
                  {reviewLabel[item.reviewStatus]||item.reviewStatus}
                </span>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">
                {item.groups.join(' / ')||'Origen por confirmar'} · {item.sourceIds.length} mensaje{item.sourceIds.length===1?'':'s'} de origen
                {!item.sourceComplete?' · Hay fuentes no recuperadas':''}
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                <Button size="sm" disabled={decisionBusy===item.index || item.reviewStatus==='confirmed'}
                  onClick={()=>void decideFinding(item.index,'approve')}>
                  {item.reviewStatus==='confirmed'?'Aprobado':'Aprobar'}
                </Button>
                <Button size="sm" variant="outline"
                  disabled={decisionBusy===item.index || item.reviewStatus==='dismissed'}
                  onClick={()=>void decideFinding(item.index,'reject')}>
                  {item.reviewStatus==='dismissed'?'Rechazado':'Rechazar'}
                </Button>
              </div>
            </div>
          ) : <p className="text-sm text-muted-foreground">No hay actividades extraídas para este día.</p>}
        </div>
      </article>
      {decisionError?<p role="alert" className="rounded-md border p-3 text-sm text-destructive">
        {decisionError}
      </p>:null}

      <details className="rounded-lg border">
        <summary className="cursor-pointer list-none px-4 py-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="text-sm font-medium">Revisar mensajes y clasificación</p>
              <p className="text-xs text-muted-foreground">
                Mensajes originales, adjuntos y clasificación sugerida.
              </p>
            </div>
            <span className="text-xs text-muted-foreground">{triage.totals.messages} mensajes</span>
          </div>
        </summary>

        <div className="space-y-4 border-t px-4 py-4">
          <div className="space-y-2">
            <p className="text-xs font-medium text-muted-foreground">Destino sugerido</p>
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

          <div className="flex flex-wrap items-center gap-2">
            <Button size="sm" variant={view==='findings'?'default':'outline'}
              onClick={()=>{setView('findings');setLimit(20)}}>Resumen ({triage.findings.length})</Button>
            <Button size="sm" variant={view==='sources'?'default':'outline'}
              onClick={()=>{setView('sources');setLimit(20)}}>Mensajes ({triage.items.length})</Button>
            <div className="min-w-[170px] flex-1">
              <Input aria-label="Buscar por mensaje o actividad" value={query}
                onChange={event=>{setQuery(event.target.value);setLimit(20)}}
                placeholder="Buscar mensaje o actividad" />
            </div>
            {view==='sources'?<select aria-label="Cobertura de extracción" value={coverage}
              onChange={event=>{setCoverage(event.target.value);setLimit(20)}}
              className="h-9 rounded-md border bg-background px-2 text-sm">
              <option value="all">Todos</option>
              <option value="not_extracted">Sin actividad extraída</option>
              <option value="referenced">Incluidos en novedades</option>
              <option value="media_pending">Sin texto</option>
            </select>:null}
            {(section!=='all'||coverage!=='all'||query)?<Button variant="ghost" size="sm"
              onClick={resetFilters}>Limpiar</Button>:null}
          </div>

          {view==='findings' ? <div className="space-y-3">
            {filtered.findings.slice(0,limit).map(item=>
              <div key={item.index} className="border-l-2 border-border pl-3">
                <p className="text-sm"><span className="font-medium">{item.suggestion.label}: </span>{item.detail}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {reviewLabel[item.reviewStatus]||item.reviewStatus} · {item.groups.join(' / ')||'Origen por confirmar'}
                  {' · '}Mensajes {item.sourceIds.join(', ')}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <Button size="sm" disabled={decisionBusy===item.index || item.reviewStatus==='confirmed'}
                    onClick={()=>void decideFinding(item.index,'approve')}>
                    {item.reviewStatus==='confirmed'?'Aprobado':'Aprobar'}
                  </Button>
                  <Button size="sm" variant="outline"
                    disabled={decisionBusy===item.index || item.reviewStatus==='dismissed'}
                    onClick={()=>void decideFinding(item.index,'reject')}>
                    {item.reviewStatus==='dismissed'?'Rechazado':'Rechazar'}
                  </Button>
                </div>
              </div>)}
            {!filtered.findings.length?<p className="text-sm text-muted-foreground">Sin coincidencias.</p>:null}
          </div> : <div className="divide-y rounded-md border">
            {filtered.messages.slice(0,limit).map(item=><details key={item.id} className="group px-3 py-3">
              <summary className="cursor-pointer list-none space-y-1">
                <div className="flex flex-wrap justify-between gap-2 text-xs text-muted-foreground">
                  <span>{item.groupName} · {item.proposal.label}</span>
                  <span>{formatWhen(item.occurredAt)}</span>
                </div>
                <p className="text-sm leading-relaxed">{item.excerpt.slice(0,220)||
                  'Archivo sin texto extraíble: revisar original antes de clasificar.'}
                  {item.excerpt.length>220?'…':''}</p>
                <p className="text-xs text-muted-foreground">
                  {stageLabel[item.coverage]}
                  {item.siteHint ? ' · ' + item.siteHint : ''}
                  {item.proposal.needsMediaReview?' · Multimedia':''}
                  {item.proposal.safetyReview?' · Revisar posible riesgo':''}
                  {item.sections.length>1?' · '+item.sections.length+' bloques':''}
                </p>
              </summary>
              <div className="mt-3 space-y-2 border-t pt-3">
                <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">
                  {item.excerpt||'No hay texto que permita inferir la actividad.'}
                </p>
                <p className="text-xs text-muted-foreground">{item.proposal.reason}</p>
                {item.sections.length>1?<div className="space-y-2">
                  {item.sections.map((block,i)=><div key={String(block.lineStart)+'-'+i}
                    className="space-y-1 rounded-md border px-3 py-2">
                    <p className="text-xs font-medium">{block.proposal.label}
                      {' · '}Líneas {block.lineStart}–{block.lineEnd}
                      {block.siteHint?' · '+block.siteHint:''}
                    </p>
                    <p className="whitespace-pre-wrap break-words text-xs">{block.excerpt.slice(0,350)}</p>
                    {block.needsNumericalReview?<p className="text-xs text-destructive">
                      Verificar formato y unidad de lectura antes de utilizar cifras.
                    </p>:null}
                  </div>)}
                </div>:null}
                <Button variant="outline" size="sm" disabled={sourceLoading===item.id}
                  onClick={()=>void loadFullSource(item.id)}>
                  {sourceLoading===item.id?'Consultando…':'Ver mensaje completo y adjuntos'}
                </Button>
                {activeSource===item.id&&sourceError?<p role="alert" className="text-xs text-destructive">
                  {sourceError}</p>:null}
                {activeSource===item.id&&sourceDetail?.id===item.id?<div className="space-y-2 rounded-md border p-3">
                  <p className="text-xs font-semibold">Mensaje original · {item.groupName}</p>
                  <p className="whitespace-pre-wrap break-words text-sm">{sourceDetail.body||
                    'El mensaje original no contiene texto. Consulta los archivos.'}</p>
                  {sourceDetail.bodyTruncated?<p className="text-xs text-muted-foreground">
                    Se muestra un máximo de 20.000 caracteres.
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
            </details>)}
            {!filtered.messages.length?<p className="p-4 text-sm text-muted-foreground">Sin coincidencias.</p>:null}
          </div>}

          {((view==='findings'?filtered.findings.length:filtered.messages.length)>limit) ?
            <Button variant="outline" size="sm" onClick={()=>setLimit(v=>v+20)}>
              Mostrar 20 más</Button>:null}

          <p className="text-xs text-muted-foreground">
            La clasificación es provisional. “Reportado como realizado” refleja el texto de origen,
            no una verificación en terreno. Ningún mensaje crea automáticamente una OT, KPI o incidente.
          </p>
        </div>
      </details>
    </>:null}
  </section>;
}
