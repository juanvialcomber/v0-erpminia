'use client';

import { useState, type FormEvent } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type ManualLibrary = {
  state: 'not_connected' | 'not_indexed' | 'partially_indexed' | 'text_indexed_visual_review_pending';
  sourceCount: number; expectedSourceCount: number;
  indexedTextPages: number; pagesWithOriginalStored: number;
  visualReviewRequired: boolean; url: string;
};
type ManualReference = {
  documentId:string; title:string; label:string; pdfPage:number;
  section:string|null; excerpt:string; sourceUrl:string;
  applicability:string;
};
type ManualPartida = {
  code:string; description:string; chapter:string; unit:string;
  hasUnitPrice:false; sourceRow:number|null;
};
type AssistantResponse = {
  answer:string; knowledgeStatus?:string;
  manualReferences?:ManualReference[]; manualPartidas?:ManualPartida[];
};
type InitialResponse = { manualLibrary?:ManualLibrary };
const fetcher=async(url:string):Promise<InitialResponse>=>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  const data=await response.json().catch(()=>null);
  if(!response.ok)throw new Error(data?.error || 'Asistente no disponible');
  return data;
};
export function MopEngineeringAssistant(){
  const {data,error:startupError,isLoading}=useSWR<InitialResponse>(
    '/api/intelligence/engineering-assistant',fetcher,{revalidateOnFocus:false});
  const [question,setQuestion]=useState('');
  const [sent,setSent]=useState('');
  const [response,setResponse]=useState<AssistantResponse|null>(null);
  const [error,setError]=useState('');
  const [pending,setPending]=useState(false);
  const status=data?.manualLibrary;
  const indexed=status?.state==='text_indexed_visual_review_pending';
  async function ask(event:FormEvent<HTMLFormElement>){
    event.preventDefault();
    const q=question.trim();
    if(!q||pending)return;
    setPending(true);setError('');setResponse(null);setSent(q);
    try{
      const request=await fetch('/api/intelligence/engineering-assistant',{
        method:'POST',credentials:'include',headers:{'content-type':'application/json'},
        body:JSON.stringify({message:q}),
      });
      const result=await request.json().catch(()=>null);
      if(!request.ok)throw new Error(result?.error||'No fue posible consultar las fuentes');
      setResponse(result as AssistantResponse);
    }catch(e){setError(e instanceof Error?e.message:'Error al consultar el asistente');}
    finally{setPending(false);}
  }
  return <section aria-label="Asistente de Ingeniería y Manual de Carreteras" className="space-y-4 rounded-lg border bg-card p-5">
    <div>
      <h2 className="text-base font-semibold">Asistente técnico</h2>
      <p className="mt-1 text-sm text-muted-foreground">Consulta antecedentes de Ingeniería y referencias del Manual de Carreteras. No aprueba proyectos, presupuestos ni cambios de programa.</p>
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        {isLoading?'Verificando biblioteca del MOP…':
          startupError?'Estado de biblioteca no verificable: '+startupError.message:
          indexed?'Texto MOP indexado: '+status?.sourceCount+' de '+status?.expectedSourceCount+' fuentes. Planos y ecuaciones pendientes de revisión visual.':
          status?.state==='partially_indexed'?'Biblioteca parcial: '+status.sourceCount+' de '+status.expectedSourceCount+' fuentes.':
          'Biblioteca MOP aún no indexada en MOTIL. El asistente no citará documentos como si estuvieran conectados.'}
      </p>
    </div>
    <form onSubmit={ask} className="space-y-3">
      <label htmlFor="engineering-mop-question" className="block text-sm font-medium">Pregunta técnica</label>
      <textarea id="engineering-mop-question" value={question} onChange={e=>setQuestion(e.target.value)}
        rows={3} maxLength={1000} disabled={pending}
        placeholder="Ej.: ¿Qué antecedentes requiere una cubicación de movimientos de tierra según el Volumen 2?"
        className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"/>
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">Separa referencia MOP, datos internos y criterios que requieren validación profesional.</p>
        <Button type="submit" disabled={pending||!question.trim()}>{pending?'Consultando…':'Consultar'}</Button>
      </div>
    </form>
    {error?<StatePanel tone="error" title="Consulta no completada" description={error} className="min-h-0 py-4"/>:null}
    {response?<div className="space-y-4 border-t pt-4" aria-live="polite">
      <p className="text-xs font-medium text-muted-foreground">Consulta: {sent}</p>
      <div className="whitespace-pre-wrap text-sm leading-relaxed">{response.answer}</div>
      {(response.manualReferences?.length||0)>0?<div className="space-y-2">
        <h3 className="text-sm font-semibold">Referencias del Manual</h3>
        {response.manualReferences!.map((ref,i)=><details key={ref.documentId+':'+ref.pdfPage+':'+ref.section+':'+i} className="rounded-md border px-3 py-2">
          <summary className="cursor-pointer text-sm font-medium">{ref.label}</summary>
          <p className="mt-2 text-xs text-muted-foreground">{ref.title}. La aplicación a La Patagua depende del proyecto, contrato y revisión del responsable técnico.</p>
          <p className="mt-2 whitespace-pre-wrap text-xs">{ref.excerpt}</p>
          <a href={ref.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-block text-xs underline underline-offset-4">Catálogo MOP oficial</a>
        </details>)}
      </div>:null}
      {(response.manualPartidas?.length||0)>0?<div>
        <h3 className="text-sm font-semibold">Partidas técnicas · Sin precios</h3>
        <div className="mt-2 space-y-1">
          {response.manualPartidas!.map(item=><p key={item.code} className="text-xs">
            <strong>{item.code}</strong> · {item.description} · {item.unit}
          </p>)}
        </div>
        <p className="mt-2 text-xs text-muted-foreground">No son cotizaciones, órdenes de compra ni presupuestos aprobados.</p>
      </div>:null}
    </div>:null}
  </section>;
}
