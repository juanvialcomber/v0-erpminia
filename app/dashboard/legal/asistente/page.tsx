'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, FileSearch, History, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';

type QueueItem={folder_id:string;company:string;slot:number;document:string};
type HistoryItem={id:string;created_at:string;file_name:string;analysis:string;file_sha256:string;suggestion_status:string;suggestion:string|null};

const QUICK=[
  '¿Qué contratos requieren atención hoy?',
  '¿Qué falta pagar de IO-01?',
  '¿Qué pagos están retenidos y no realmente impagos?',
  '¿Qué proveedores tienen documentos pendientes?',
];

export default function LegalAssistantPage(){
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [queue,setQueue]=useState<QueueItem[]>([]);
 const [queueError,setQueueError]=useState('');
 const [queueLoading,setQueueLoading]=useState(true);
 const [analysis,setAnalysis]=useState('');
 const [analysisError,setAnalysisError]=useState('');
 const [analyzing,setAnalyzing]=useState(false);
 const [analyzedDocument,setAnalyzedDocument]=useState('');
 const [history,setHistory]=useState<HistoryItem[]>([]);
 const [historyError,setHistoryError]=useState('');
 const [historyTarget,setHistoryTarget]=useState('');
 const [observation,setObservation]=useState<Record<string,string>>({});
 const [savingReview,setSavingReview]=useState('');
 const [decisionError,setDecisionError]=useState('');
 const [testFile,setTestFile]=useState<File|null>(null);
 const [testResult,setTestResult]=useState('');
 const [testError,setTestError]=useState('');
 const [testBusy,setTestBusy]=useState(false);

 useEffect(()=>{
  let live=true;
  fetch('/api/legal/asistente',{credentials:'include'}).then(async response=>{
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Bandeja no disponible');
   if(live)setQueue(Array.isArray(result.review_queue)?result.review_queue:[]);
  }).catch(err=>{if(live)setQueueError(err instanceof Error?err.message:'No se pudo consultar bandeja');})
    .finally(()=>{if(live)setQueueLoading(false);});
  return()=>{live=false;};
 },[]);

 const ask=async(value?:string)=>{
  const query=(value??question).trim();
  if(!query||busy)return;
  setQuestion(query);setBusy(true);setError('');setAnswer('');
  try{
   const response=await fetch('/api/legal/asistente',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({question:query})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'Servicio no disponible');
   setAnswer(String(data.answer||''));setQueue(Array.isArray(data.review_queue)?data.review_queue:[]);
  }catch(e){setError(e instanceof Error?e.message:'Error inesperado');}
  finally{setBusy(false);}
 };

 const analyze=async(folderId:string,slot:number,label:string)=>{
  if(analyzing)return;
  setAnalyzing(true);setAnalysis('');setAnalysisError('');setAnalyzedDocument(label);
  try{
   const response=await fetch('/api/legal/asistente/analyze-document',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({carpeta_id:folderId,slot_index:slot})});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'No se pudo analizar el documento');
   setAnalysis(String(result.analysis||''));void loadHistory(folderId,slot);
  }catch(e){setAnalysisError(e instanceof Error?e.message:'Análisis no disponible');}
  finally{setAnalyzing(false);}
 };

 const loadHistory=async(folderId:string,slot:number)=>{
  setHistory([]);setHistoryError('');setHistoryTarget(folderId+'-'+slot);
  try{
   const res=await fetch('/api/legal/asistente/history?carpeta_id='+encodeURIComponent(folderId)+'&slot_index='+slot,{credentials:'include'});
   const json=await res.json().catch(()=>({}));
   if(!res.ok)throw new Error(json.error||'Historial no disponible');
   setHistory(Array.isArray(json.history)?json.history:[]);
  }catch(e){setHistoryError(e instanceof Error?e.message:'No se pudo consultar el historial');}
 };

 const decide=async(id:string,status:'accepted'|'dismissed')=>{
  if(savingReview)return;
  setSavingReview(id);setDecisionError('');
  try{
   const response=await fetch('/api/legal/asistente/history',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status,suggestion:observation[id]||''})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'No se pudo registrar la decisión');
   setHistory(rows=>rows.map(row=>row.id===id?{...row,suggestion_status:status,suggestion:status==='accepted'?(observation[id]||''):null}:row));
  }catch(e){setDecisionError(e instanceof Error?e.message:'Error de revisión');}
  finally{setSavingReview('');}
 };

 const runTest=async()=>{
  if(!testFile||testBusy)return;
  setTestBusy(true);setTestResult('');setTestError('');
  const form=new FormData();form.append('file',testFile);
  try{
   const response=await fetch('/api/legal/asistente/test-document',{method:'POST',credentials:'include',body:form});
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Error al analizar');
   setTestResult(String(result.analysis||''));
  }catch(e){setTestError(e instanceof Error?e.message:'No fue posible analizar el PDF');}
  finally{setTestBusy(false);}
 };

 return <main className="mx-auto max-w-4xl space-y-5">
  <header className="border-b border-border/70 pb-4">
   <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Copiloto</p>
   <h1 className="mt-1 text-2xl font-semibold">Asistente de Elías</h1>
   <p className="mt-1 text-sm text-muted-foreground">Pregunta por contratos, avances, pagos, proveedores o documentos. La respuesta prioriza conclusión, siguiente acción y evidencia.</p>
  </header>

  <section className="rounded-md border p-4">
   <div className="flex items-center gap-2"><Sparkles className="h-4 w-4 text-muted-foreground"/><h2 className="text-sm font-semibold">Preguntas rápidas</h2></div>
   <div className="mt-3 flex flex-wrap gap-2">{QUICK.map(item=><Button key={item} size="sm" variant="outline" disabled={busy} onClick={()=>void ask(item)}>{item}</Button>)}</div>
   <label htmlFor="legal-question" className="mt-5 block text-sm font-medium">¿Qué necesitas revisar?</label>
   <Textarea id="legal-question" rows={3} maxLength={1800} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="Escribe una consulta concreta sobre contratos, pagos o proveedores." className="mt-2"/>
   <Button className="mt-3" disabled={busy||!question.trim()} onClick={()=>void ask()}>{busy?'Analizando…':'Consultar'}</Button>
   {error?<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>:null}
  </section>

  {answer?<section aria-live="polite" className="rounded-md border">
    <div className="border-b bg-muted/20 px-4 py-3"><p className="text-sm font-semibold">Respuesta</p><p className="mt-1 text-xs text-muted-foreground">Hechos del sistema + evidencia disponible. No ejecuta pagos ni aprobaciones.</p></div>
    <div className="whitespace-pre-wrap p-4 text-sm leading-relaxed">{answer}</div>
   </section>:null}

  <section className="flex flex-wrap items-center justify-between gap-3 rounded-md border p-4">
   <div><p className="text-sm font-semibold">Trabajo pendiente</p><p className="mt-1 text-xs text-muted-foreground">{queueLoading?'Consultando…':queueError?'Bandeja no disponible':queue.length+' documentos esperan revisión L1.'}</p></div>
   <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/contratistas-documentos">Abrir proveedores <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
  </section>

  <details className="rounded-md border">
   <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">Herramientas documentales</summary>
   <div className="space-y-4 border-t p-4">
    <p className="text-xs text-muted-foreground">Estas herramientas apoyan la revisión. No reemplazan la decisión humana ni modifican aprobaciones.</p>
    {queueError?<p className="text-sm text-destructive">{queueError}</p>:null}
    {queue.length?<ul className="space-y-2">{queue.slice(0,8).map(item=><li key={item.folder_id+'-'+item.slot} className="rounded-md border p-3 text-sm">
      <p className="font-medium">{item.company}</p><p className="text-xs text-muted-foreground">{item.slot}. {item.document}</p>
      <div className="mt-2 flex flex-wrap gap-2">
       <Button size="sm" variant="outline" disabled={analyzing} onClick={()=>void analyze(item.folder_id,item.slot,item.document)}><FileSearch className="mr-2 h-4 w-4"/>{analyzing?'Analizando…':'Analizar'}</Button>
       <Button size="sm" variant="ghost" onClick={()=>void loadHistory(item.folder_id,item.slot)}><History className="mr-2 h-4 w-4"/>Historial</Button>
      </div>
     </li>)}</ul>:!queueLoading?<p className="text-sm text-muted-foreground">No hay documentos pendientes de revisión L1.</p>:null}

    {analysisError?<p className="text-sm text-destructive">{analysisError}</p>:null}
    {analysis?<div className="rounded-md bg-muted/30 p-4"><p className="text-sm font-semibold">Análisis preliminar · {analyzedDocument}</p><p className="mt-2 whitespace-pre-wrap text-sm">{analysis}</p><p className="mt-2 text-xs text-muted-foreground">No constituye aprobación.</p></div>:null}

    {historyTarget?<div className="space-y-2">
      <p className="text-sm font-semibold">Historial documental</p>
      {historyError?<p className="text-sm text-destructive">{historyError}</p>:history.map(entry=><div key={entry.id} className="rounded-md border p-3 text-sm">
       <p className="font-medium">{entry.file_name}</p><p className="text-xs text-muted-foreground">{new Date(entry.created_at).toLocaleString('es-CL')} · Versión registrada</p>
       <p className="mt-2 whitespace-pre-wrap">{entry.analysis}</p>
       {entry.suggestion_status==='proposed'?<div className="mt-3 space-y-2"><Textarea placeholder="Observación para revisión humana" value={observation[entry.id]||''} onChange={e=>setObservation(cur=>({...cur,[entry.id]:e.target.value}))}/><div className="flex gap-2"><Button size="sm" disabled={savingReview!==''||!(observation[entry.id]||'').trim()} onClick={()=>void decide(entry.id,'accepted')}>Guardar observación</Button><Button size="sm" variant="outline" disabled={savingReview!==''} onClick={()=>void decide(entry.id,'dismissed')}>Descartar propuesta</Button></div><p className="text-xs text-muted-foreground">No modifica la aprobación documental.</p></div>:null}
      </div>)}
    </div>:null}
    {decisionError?<p className="text-sm text-destructive">{decisionError}</p>:null}

    <div className="border-t pt-4">
     <p className="text-sm font-semibold">Prueba de PDF aislada</p>
     <p className="mt-1 text-xs text-muted-foreground">No se guarda ni genera aprobaciones.</p>
     <input aria-label="Seleccionar PDF de prueba" type="file" accept=".pdf,application/pdf" onChange={e=>setTestFile(e.target.files?.[0]||null)} className="mt-3 block max-w-full text-sm"/>
     <Button className="mt-2" size="sm" variant="outline" disabled={!testFile||testBusy} onClick={()=>void runTest()}>{testBusy?'Analizando…':'Analizar PDF'}</Button>
     {testError?<p className="mt-2 text-sm text-destructive">{testError}</p>:null}
     {testResult?<p className="mt-2 whitespace-pre-wrap rounded-md bg-muted p-3 text-sm">{testResult}</p>:null}
    </div>
   </div>
  </details>
 </main>;
}
