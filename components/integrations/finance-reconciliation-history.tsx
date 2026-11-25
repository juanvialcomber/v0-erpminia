'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';

type Row = { id:string; issue_type:string; status:string; evidence_reference:string|null; resolution_note:string|null; reviewed_at:string|null; updated_at:string };
type History = { rows:Row[]; total:number; page:number };
const labels:Record<string,string> = {accepted:'Evidencia aceptada',ignored:'Evidencia no adoptada',resolved:'Resuelto'};
async function fetcher(url:string):Promise<History>{
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  if(!response.ok)throw new Error(response.status===403?'Sin acceso al historial de decisiones.':'No se pudo consultar el historial.');
  return response.json();
}
export function FinanceReconciliationHistory(){
  const [open,setOpen]=useState(false);
  const [page,setPage]=useState(1);
  const {data,error,isLoading,mutate}=useSWR<History>(open?'/api/integrations/laudus/finance-reconciliation-review?view=history&page='+page:null,fetcher,{revalidateOnFocus:false});
  return <details className="rounded-lg border bg-card" onToggle={event=>setOpen(event.currentTarget.open)}>
    <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Historial de conciliaciones</summary>
    {open?<section className="space-y-3 border-t p-4">
      <p className="text-xs text-muted-foreground">Decisiones registradas. Una evidencia aceptada no equivale a un pago ni a una corrección contable.</p>
      {error?<div role="status" className="space-y-2 text-sm">{error.message}<Button variant="outline" size="sm" onClick={()=>void mutate()}>Reintentar</Button></div>:isLoading||!data?<p role="status" className="text-sm text-muted-foreground">Consultando historial…</p>:<>
        <p className="text-xs text-muted-foreground">{data.total.toLocaleString('es-CL')} registros de revisión</p>
        {data.rows.length?<div className="divide-y rounded-md border">{data.rows.map(row=><details key={row.id} className="p-3">
          <summary className="cursor-pointer text-sm"><span className="font-medium">{row.issue_type}</span><span className="mt-1 block text-xs text-muted-foreground">{labels[row.status]??row.status} · {new Date(row.reviewed_at??row.updated_at).toLocaleDateString('es-CL',{timeZone:'America/Santiago'})}</span></summary>
          <div className="mt-3 space-y-2 text-xs break-words"><p><strong>Respaldo:</strong> {row.evidence_reference??'Sin respaldo adicional'}</p><p><strong>Registro de resolución:</strong> {row.resolution_note??'Sin nota registrada'}</p></div>
        </details>)}</div>:<p className="text-sm text-muted-foreground">No hay decisiones en esta página.</p>}
        <div className="flex items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs">Página {page}</span><Button variant="outline" size="sm" disabled={page*25>=data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
      </>}
    </section>:null}
  </details>;
}
