'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, ShieldCheck } from 'lucide-react';

type Obligation = {
  id?: string; code?: string; title?: string; label?: string; priority: 'critical'|'high'|'medium';
  nextAction?: string; evidenceCount: number; reviewState: string;
  applicabilityState: string; timingRule?: string; sourceModules?: string[];
  evidenceRefs?: Array<{ canonicalRef:string; label:string; scope:string; freshnessAt?:string|null }>;
  legalContacts?: Array<{cargo:string;people:Array<{full_name:string|null}>}>;
};
type Payload = { available:boolean; obligations:Obligation[]; summary?:{obligations:number;withMatchedEvidence:number;withoutMatchedEvidence:number;complianceVerdictCalculated:boolean}; errorCode?:string };
const fetcher = async (url:string) => {const response=await fetch(url,{credentials:'include'});if(!response.ok)throw Error('No se pudo consultar la matriz');return response.json() as Promise<Payload>;};
export default function Compliance360Page(){
  const {data,error,isLoading,mutate}=useSWR<Payload>('/api/legal/sernageomin',fetcher,{revalidateOnFocus:false});
  const [filter,setFilter]=useState<'pending'|'all'>('pending');
  const [query,setQuery]=useState('');
  const {data:work,mutate:reloadWork}=useSWR<{items:Array<{id:string;title:string;status:string;metadata:{obligationId?:string;applicability?:'applicable'|'not_applicable'|'undetermined';history?:Array<{action:string;note:string;at:string}>}}>;canWrite:boolean}>('/api/legal/compliance-360',fetcher as never);
  const [selected,setSelected]=useState<string|null>(null);
  const [action,setAction]=useState('request_evidence');
  const [decision,setDecision]=useState('undetermined');
  const [note,setNote]=useState('');
  const [owner,setOwner]=useState('');
  const [dueDate,setDueDate]=useState('');
  const [evidenceRef,setEvidenceRef]=useState('');
  const [saving,setSaving]=useState(false);
  const [feedback,setFeedback]=useState('');
  const save=async(obligationId:string)=>{
    setSaving(true);setFeedback('');
    try{
      const response=await fetch('/api/legal/compliance-360',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({obligationId,action,decision,note,owner,dueDate,evidenceRef})});
      const result=await response.json();
      if(!response.ok)throw Error(result.error||'No se guardó');
      await reloadWork();setFeedback('Decisión registrada con historial');setNote('');
    }catch(error){setFeedback(error instanceof Error?error.message:'Error al guardar');}finally{setSaving(false);}
  };
  const obligations=useMemo(()=>(data?.obligations||[]).filter(item=>{
    const record=work?.items?.find(row=>row.metadata?.obligationId===item.id);
    if(filter==='pending'&&record?.metadata?.applicability==='not_applicable')return false;
    return [item.title,item.label,item.code,item.nextAction].join(' ').toLocaleLowerCase('es').includes(query.toLocaleLowerCase('es'));
  }),[data,work,filter,query]);
  return <div className="mx-auto max-w-6xl space-y-6">
    <header className="space-y-3 border-b pb-5">
      <Link href="/dashboard/legal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground"><ArrowLeft className="size-4"/>Legal</Link>
      <div className="flex items-start gap-3"><ShieldCheck className="mt-1 size-7 text-primary"/><div><h1 className="text-2xl font-semibold">Cumplimiento SERNAGEOMIN · La Patagua</h1><p className="mt-1 text-sm text-muted-foreground">Elías revisa obligaciones, solicita documentos y registra decisiones. Ninguna coincidencia documental acredita cumplimiento.</p></div></div>
    </header>
    {error||data?.available===false?<div className="rounded-lg border p-5"><p>No se pudo cargar el contexto regulatorio. No se presentan estados estimados.</p><button type="button" className="mt-3 text-sm underline" onClick={()=>void mutate()}>Reintentar</button></div>:null}
    {isLoading?<p className="text-sm text-muted-foreground">Consultando fuentes regulatorias y evidencia canónica…</p>:null}
    {data?.available ? <>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border p-3 text-sm">
        <p className="text-muted-foreground">Expedientes trabajados por Legal · Exportación de auditoría con decisiones, responsables y referencias canónicas.</p>
        <a className="rounded-md border px-3 py-2 font-medium hover:bg-muted" href="/api/legal/compliance-360?export=1">Exportar registro</a>
      </div>
      <div className="flex flex-wrap gap-3 text-sm text-muted-foreground"><span>{data.obligations.length} obligaciones del catálogo por evaluar</span><span>·</span><span>{work?.items?.length??0} expedientes iniciados</span></div>
      <div className="flex flex-wrap items-center gap-2"><input aria-label="Buscar obligación" placeholder="Buscar obligación…" value={query} onChange={event=>setQuery(event.target.value)} className="min-w-56 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/>{([{key:'pending',label:'Por resolver'},{key:'all',label:'Todas'}] as const).map(option=><button key={option.key} type="button" onClick={()=>setFilter(option.key)} aria-pressed={filter===option.key} className={`rounded-md border px-3 py-2 text-sm ${filter===option.key?'border-primary bg-primary/10 font-semibold':'hover:bg-muted'}`}>{option.label}</button>)}</div>
      <div className="space-y-3">{obligations.length===0?<p className="rounded-lg border p-5 text-sm text-muted-foreground">No hay obligaciones para este filtro.</p>:obligations.map((item,index)=><article key={item.id||item.code||index} className="rounded-lg border bg-card p-4 space-y-3">
        <div className="flex flex-wrap justify-between gap-2"><h2 className="max-w-3xl font-semibold">{item.title||item.label||item.code||'Obligación sin título'}</h2><span className="text-xs font-medium text-muted-foreground">{item.priority==='critical'?'Prioridad crítica':item.priority==='high'?'Prioridad alta':'Prioridad media'}</span></div>
        <p className="text-xs text-muted-foreground">Aplicabilidad por revisar · No constituye certificación de cumplimiento</p>
        <p className="text-sm">{item.nextAction||'Determinar la aplicabilidad y solicitar evidencia verificable.'}</p>
        <p className="text-sm text-muted-foreground">{item.evidenceCount>0?`${item.evidenceCount} evidencia(s) candidata(s) por verificar`:'Sin evidencia candidata encontrada; esto no significa ausencia documental definitiva.'}</p>
        {item.evidenceRefs?.length?<details className="text-sm"><summary className="cursor-pointer font-medium">Ver referencias de evidencia</summary><ul className="mt-2 space-y-1">{item.evidenceRefs.map(e=><li key={e.canonicalRef} className="break-words text-muted-foreground">{e.label} · {e.scope} · {e.canonicalRef}</li>)}</ul></details>:null}
        {(() => { const record=work?.items?.find(row=>row.metadata?.obligationId===item.id);return <div className="space-y-3 rounded-md bg-muted/30 p-3 text-sm">
          <div className="flex flex-wrap justify-between gap-2"><span>{record?`Expediente: ${record.status}`:'Sin expediente de revisión todavía'}</span><button type="button" className="font-semibold text-primary underline" onClick={()=>{setSelected(selected===item.id?null:item.id||null);setFeedback('');}}> {selected===item.id?'Cerrar ficha':'Revisar obligación'}</button></div>
          {record?.metadata?.history?.length?<details><summary className="cursor-pointer">Historial de decisiones ({record.metadata.history.length})</summary><ul className="mt-2 space-y-2">{record.metadata.history.map((entry,i)=><li key={i} className="border-l-2 pl-2">{entry.action} · {new Date(entry.at).toLocaleString('es-CL',{timeZone:'America/Santiago'})} · {entry.note}</li>)}</ul></details>:null}
          {selected===item.id&&work?.canWrite?<div className="space-y-3 border-t pt-3">
            <label className="block">Acción<select className="mt-1 w-full rounded border bg-background p-2" value={action} onChange={e=>setAction(e.target.value)}><option value="applicability">Determinar aplicabilidad</option><option value="request_evidence">Solicitar antecedentes</option><option value="approve_evidence">Validar evidencia</option><option value="return_evidence">Devolver con observaciones</option></select></label>
            {action==='applicability'?<label className="block">Decisión<select className="mt-1 w-full rounded border bg-background p-2" value={decision} onChange={e=>setDecision(e.target.value)}><option value="undetermined">Por determinar</option><option value="applicable">Aplica</option><option value="not_applicable">No aplica</option></select></label>:null}
            <div className="grid gap-2 sm:grid-cols-2"><label>Área o encargado<input className="mt-1 w-full rounded border bg-background p-2" value={owner} onChange={e=>setOwner(e.target.value)} placeholder="Área responsable"/></label><label>Vencimiento operativo<input type="date" className="mt-1 w-full rounded border bg-background p-2" value={dueDate} onChange={e=>setDueDate(e.target.value)}/></label></div>
            {action==='approve_evidence'?<label className="block">Referencia de evidencia canónica<select className="mt-1 w-full rounded border bg-background p-2" value={evidenceRef} onChange={e=>setEvidenceRef(e.target.value)}><option value="">Selecciona evidencia canónica</option>{(item.evidenceRefs||[]).map(e=><option key={e.canonicalRef} value={e.canonicalRef}>{e.label} · {e.scope}</option>)}</select></label>:null}
            <label className="block">Fundamento y siguiente acción<textarea className="mt-1 w-full rounded border bg-background p-2" value={note} maxLength={1500} onChange={e=>setNote(e.target.value)} placeholder="Indica evidencia, criterio y acción concreta" rows={3}/></label>
            <button type="button" disabled={saving||!note.trim()||(action==='approve_evidence'&&!evidenceRef.trim())} onClick={()=>void save(item.id||'')} className="rounded bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-40">{saving?'Guardando…':'Registrar decisión'}</button>
            {feedback?<p role="status">{feedback}</p>:null}
          </div>:null}
        </div>;})()}
        <div className="flex flex-wrap gap-3 border-t pt-3 text-sm"><Link className="inline-flex items-center gap-1 font-medium text-primary hover:underline" href="/dashboard/legal/casos">Gestionar expediente <ArrowRight className="size-4"/></Link><Link className="text-muted-foreground hover:underline" href="/dashboard/legal/documentos">Consultar documentos</Link></div>
      </article>)}</div>
      <p className="text-xs text-muted-foreground">Esta vista no emite certificados, no crea dictámenes automáticos y no modifica registros canónicos. La verificación y firma corresponden al equipo autorizado.</p>
    </>:null}
  </div>;
}
