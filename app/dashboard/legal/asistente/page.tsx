'use client';
import { useState, useEffect } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
export default function LegalAssistantPage() {
 const [testFile,setTestFile]=useState<File|null>(null);
 const [testResult,setTestResult]=useState('');
 const [testError,setTestError]=useState('');
 const [testBusy,setTestBusy]=useState(false);
 const runTest=async()=>{
  if(!testFile||testBusy)return;
  setTestBusy(true);setTestResult('');setTestError('');
  const form=new FormData();form.append('file',testFile);
  try{const response=await fetch('/api/legal/asistente/test-document',{method:'POST',credentials:'include',body:form});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'Error al analizar');setTestResult(String(result.analysis||''));}
  catch(error){setTestError(error instanceof Error?error.message:'No fue posible analizar el PDF');}finally{setTestBusy(false);}
 };
 const [question,setQuestion]=useState('');
 const [answer,setAnswer]=useState('');
 const [error,setError]=useState('');
 const [busy,setBusy]=useState(false);
 const [queue,setQueue]=useState<Array<{folder_id:string;company:string;slot:number;document:string}>>([]);
 const [queueError,setQueueError]=useState('');
 const [history,setHistory]=useState<Array<{id:string;created_at:string;file_name:string;analysis:string;file_sha256:string;suggestion_status:string;suggestion:string|null}>>([]);
 const [historyError,setHistoryError]=useState('');
 const [observation,setObservation]=useState<Record<string,string>>({});
 const [savingReview,setSavingReview]=useState('');
 const [decisionError,setDecisionError]=useState('');
 const decide=async(id:string,status:'accepted'|'dismissed')=>{
  if(savingReview)return;
  setSavingReview(id);setDecisionError('');
  try {const response=await fetch('/api/legal/asistente/history',{method:'PATCH',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,status,suggestion:observation[id]||''})});const data=await response.json().catch(()=>({}));if(!response.ok)throw new Error(data.error||'No se pudo registrar la decisión');setHistory(rows=>rows.map(row=>row.id===id?{...row,suggestion_status:status,suggestion:status==='accepted'?(observation[id]||''):null}:row));}
  catch(e){setDecisionError(e instanceof Error?e.message:'Error de revisión');}finally{setSavingReview('');}
 };

 const [historyTarget,setHistoryTarget]=useState('');
 const loadHistory=async (folderId:string,slot:number)=>{
  setHistory([]);setHistoryError('');setHistoryTarget(`${folderId}-${slot}`);
  try{const res=await fetch(`/api/legal/asistente/history?carpeta_id=${encodeURIComponent(folderId)}&slot_index=${slot}`,{credentials:'include'});const json=await res.json().catch(()=>({}));if(!res.ok)throw new Error(json.error||'Historial no disponible');setHistory(Array.isArray(json.history)?json.history:[]);}
  catch(e){setHistoryError(e instanceof Error?e.message:'No se pudo consultar el historial');}
 };
 const [analysis,setAnalysis]=useState('');
 const [analysisError,setAnalysisError]=useState('');
 const [analyzing,setAnalyzing]=useState(false);
 const [analyzedDocument,setAnalyzedDocument]=useState('');
 const analyze=async (folderId:string,slot:number,label:string)=>{
  if(analyzing)return;
  setAnalyzing(true);setAnalysis('');setAnalysisError('');setAnalyzedDocument(label);
  try { const response=await fetch('/api/legal/asistente/analyze-document',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({carpeta_id:folderId,slot_index:slot})});
   const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error||'No se pudo analizar el documento');setAnalysis(String(result.analysis||''));void loadHistory(folderId,slot);
  }catch(error){setAnalysisError(error instanceof Error?error.message:'Análisis no disponible');}finally{setAnalyzing(false);}
 };
 const [queueLoading,setQueueLoading]=useState(true);
 useEffect(()=>{
  let live=true;
  fetch('/api/legal/asistente',{credentials:'include'}).then(async response=>{
   const result=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(result.error||'Bandeja no disponible');
   if(live)setQueue(Array.isArray(result.review_queue)?result.review_queue:[]);
  }).catch(err=>{if(live)setQueueError(err instanceof Error?err.message:'No se pudo consultar bandeja');}).finally(()=>{if(live)setQueueLoading(false);});
  return ()=>{live=false;};
 },[]);
 const ask=async()=>{
  if(!question.trim()||busy)return;
  setBusy(true);setError('');setAnswer('');
  try {
   const response=await fetch('/api/legal/asistente',{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({question})});
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw new Error(data.error||'Servicio no disponible');
   setAnswer(String(data.answer||''));
   setQueue(Array.isArray(data.review_queue)?data.review_queue:[]);
  }catch(e){setError(e instanceof Error?e.message:'Error inesperado');}
  finally{setBusy(false);}
 };
 return <main className="mx-auto max-w-3xl space-y-5">
  <header><h1 className="text-2xl font-semibold">Asistente IA de Legal</h1><p className="text-sm text-muted-foreground">Copiloto de Elías para documentos EECC y contexto SERNAGEOMIN. Las decisiones son humanas.</p></header>
  <div className="rounded-lg border p-4 space-y-3">
   <label htmlFor="legal-question" className="text-sm font-medium">Consulta jurídica y documental</label>
   <Textarea id="legal-question" rows={4} maxLength={1800} value={question} onChange={e=>setQuestion(e.target.value)} placeholder="¿Qué documentos de contratistas están pendientes de revisar?"/>
   <Button disabled={busy||!question.trim()} onClick={ask}>{busy?'Consultando...':'Consultar IA'}</Button>
   {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
   {answer?<div aria-live="polite" className="rounded-md bg-muted p-4 text-sm whitespace-pre-wrap">{answer}</div>:null}
   <section className="space-y-2"><h2 className="text-sm font-semibold">Documentos disponibles para revisión</h2>{queueLoading?<p className="text-sm text-muted-foreground">Consultando bandeja...</p>:queueError?<p role="alert" className="text-sm text-destructive">{queueError}</p>:queue.length ? <ul className="space-y-2">{queue.slice(0,10).map(item=><li key={`${item.folder_id}-${item.slot}`} className="rounded-md border p-3 text-sm"><span className="font-medium">{item.company}</span><p className="text-muted-foreground">{item.slot}. {item.document}</p><div className="flex flex-wrap gap-3 mt-2"><Button size="sm" variant="outline" disabled={analyzing} onClick={()=>void analyze(item.folder_id,item.slot,item.document)}>{analyzing?'Analizando…':'Analizar PDF'}</Button><Button size="sm" variant="ghost" onClick={()=>void loadHistory(item.folder_id,item.slot)}>Historial</Button><Link className="text-primary underline text-sm" href="/dashboard/legal/contratistas-documentos">Revisión humana</Link></div></li>)}</ul>:<p className="text-sm text-muted-foreground">No hay documentos cargados sin revisión L1 en las carpetas asociadas a la organización.</p>}</section>
   {decisionError?<p role="alert" className="text-sm text-destructive">{decisionError}</p>:null}
   {historyTarget?<section className="space-y-2"><h3 className="text-sm font-semibold">Historial documental</h3>{historyError?<p role="alert" className="text-sm text-destructive">{historyError}</p>:history.length?<ul className="space-y-2">{history.map(entry=><li key={entry.id} className="rounded-md border p-3 text-sm"><p className="font-medium">{entry.file_name} · {new Date(entry.created_at).toLocaleString('es-CL')}</p><p className="text-xs text-muted-foreground">Versión SHA-256: {entry.file_sha256.slice(0,12)}… · Propuesta IA sin aprobación</p><p className="mt-2 whitespace-pre-wrap">{entry.analysis}</p>{entry.suggestion_status==='proposed'?<div className="space-y-2 mt-3"><Textarea aria-label="Observación revisada" placeholder="Redacta una observación para validar (no aprueba el documento)" value={observation[entry.id]||''} onChange={e=>setObservation(current=>({...current,[entry.id]:e.target.value}))}/><div className="flex gap-2"><Button size="sm" disabled={savingReview!==''||!(observation[entry.id]||'').trim()} onClick={()=>void decide(entry.id,'accepted')}>Guardar observación</Button><Button size="sm" variant="outline" disabled={savingReview!==''} onClick={()=>void decide(entry.id,'dismissed')}>Descartar propuesta</Button></div></div>:<p className="text-xs text-muted-foreground mt-2">{entry.suggestion_status==='accepted'?'Observación guardada para revisión: '+(entry.suggestion||''): 'Propuesta descartada'} · No modifica la aprobación documental.</p>}</li>)}</ul>:<p className="text-sm text-muted-foreground">No hay análisis guardados para este documento.</p>}</section>:null}
   {analysisError?<p role="alert" className="text-sm text-destructive">{analysisError}</p>:null}
   {analysis?<section className="rounded-md border p-4 space-y-2"><h2 className="font-semibold text-sm">Análisis preliminar de {analyzedDocument}</h2><p className="text-sm whitespace-pre-wrap">{analysis}</p><p className="text-xs text-muted-foreground">No constituye aprobación. Elías debe contrastar contra el PDF original.</p></section>:null}
  </div>
  <section className="rounded-lg border p-4 space-y-3"><h2 className="font-semibold text-sm">Prueba de PDF aislada</h2><p className="text-xs text-muted-foreground">Sube un PDF de referencia para analizarlo. No se almacena en carpetas EECC ni genera aprobaciones.</p><input aria-label="Seleccionar PDF de prueba" type="file" accept=".pdf,application/pdf" onChange={e=>setTestFile(e.target.files?.[0]||null)} className="block text-sm max-w-full"/><Button disabled={!testFile||testBusy} onClick={()=>void runTest()}>{testBusy?"Analizando PDF...":"Analizar PDF de prueba"}</Button>{testError?<p role="alert" className="text-sm text-destructive">{testError}</p>:null}{testResult?<p className="whitespace-pre-wrap text-sm rounded-md bg-muted p-4">{testResult}</p>:null}</section>
  <section className="text-sm space-y-2"><h2 className="font-semibold">Fuentes de consulta</h2>
   <p className="text-muted-foreground">Verifica texto vigente y aplicabilidad. El asistente no certifica cumplimiento ni lee archivos originales.</p>
   <p><a className="underline text-primary" href="https://www.sernageomin.cl/seguridad-minera/" target="_blank" rel="noopener noreferrer">SERNAGEOMIN: seguridad minera</a></p>
   <p><a className="underline text-primary" href="https://www.bcn.cl/leychile/navegar?idNorma=257601" target="_blank" rel="noopener noreferrer">DS 76: subcontratación</a></p>
  </section>
 </main>;
}
