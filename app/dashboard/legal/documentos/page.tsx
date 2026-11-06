'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { CheckCircle2, Download, FileText, Inbox, Search, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';

type ReviewState = 'pending' | 'approved' | 'rejected';
type LegalDocument = {
  id:string;
  document_name:string;
  document_type:string;
  document_type_category:string;
  document_code:string;
  description:string;
  status:string;
  review_state:ReviewState;
  file_size_bytes:number;
  uploaded_at:string|null;
  uploaded_by:string;
  uploaded_by_email:string|null;
  valid_until:string|null;
  version:number;
  l1_observations:string|null;
  provenance_status:string|null;
  canonical_section:string|null;
  preview_url:string;
};
type Payload = { documents:LegalDocument[]; total:number; summary:{pending:number;approved:number;rejected:number}; accessLevel:'ED'|'LEC'|'SR' };
type PreviewPayload = { kind:'text'|'pdf'|'image'|'unavailable'; text?:string; url?:string; truncated?:boolean; reason?:string };

const stateLabel:Record<ReviewState,string>={pending:'Pendiente',approved:'Aprobado',rejected:'Rechazado'};

function fmtDate(value:string|null){
  if(!value) return 'Sin fecha';
  const date=new Date(value);
  if(Number.isNaN(date.getTime())) return 'Sin fecha';
  return date.toLocaleDateString('es-CL',{day:'2-digit',month:'short',year:'numeric'});
}

function fmtSize(bytes:number){
  if(!bytes) return '';
  if(bytes<1024*1024) return Math.round(bytes/1024)+' KB';
  return (bytes/1024/1024).toFixed(1)+' MB';
}

export default function LegalDocumentsPage(){
  const [payload,setPayload]=useState<Payload|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [selectedId,setSelectedId]=useState<string|null>(null);
  const [preview,setPreview]=useState<PreviewPayload|null>(null);
  const [previewLoading,setPreviewLoading]=useState(false);
  const [filter,setFilter]=useState<ReviewState>('pending');
  const [search,setSearch]=useState('');
  const [observations,setObservations]=useState('');
  const [saving,setSaving]=useState<'approve'|'reject'|null>(null);
  const [decisionError,setDecisionError]=useState<string|null>(null);

  const load=async(preserveSelection=true)=>{
    setLoading(true);
    setError(null);
    try{
      const response=await fetch('/api/legal/documentos',{credentials:'include',cache:'no-store'});
      const data=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(data?.error||'No se pudo cargar la bandeja legal');
      setPayload(data);
      const docs=(data?.documents||[]) as LegalDocument[];
      if(!preserveSelection || !selectedId || !docs.some((doc)=>doc.id===selectedId)){
        const first=docs.find((doc)=>doc.review_state===filter) || docs[0] || null;
        setSelectedId(first?.id||null);
      }
    }catch(err){
      setError(err instanceof Error?err.message:'No se pudo cargar la bandeja legal');
    }finally{setLoading(false);}
  };

  useEffect(()=>{ void load(false); },[]);

  const documents=payload?.documents||[];
  const filtered=useMemo(()=>{
    const term=search.trim().toLowerCase();
    return documents.filter((doc)=>doc.review_state===filter).filter((doc)=>!term || [doc.document_name,doc.document_type_category,doc.description,doc.uploaded_by].some((value)=>String(value||'').toLowerCase().includes(term)));
  },[documents,filter,search]);

  const selected=documents.find((doc)=>doc.id===selectedId)||null;
  const canEdit=payload?.accessLevel==='ED';

  useEffect(()=>{
    if(filtered.length && (!selected || selected.review_state!==filter || !filtered.some((doc)=>doc.id===selected.id))){
      setSelectedId(filtered[0].id);
    }
    if(!filtered.length && selected?.review_state===filter) setSelectedId(null);
  },[filter,search,filtered.length]);

  useEffect(()=>{
    if(!selected){ setPreview(null); return; }
    let cancelled=false;
    setPreviewLoading(true);
    setPreview(null);
    setObservations('');
    setDecisionError(null);
    fetch(selected.preview_url,{credentials:'include',cache:'no-store'})
      .then(async(response)=>{ const data=await response.json().catch(()=>null); if(!response.ok) throw new Error(data?.error||'No se pudo generar la vista previa'); return data; })
      .then((data)=>{ if(!cancelled) setPreview(data); })
      .catch((err)=>{ if(!cancelled) setPreview({kind:'unavailable',reason:err instanceof Error?err.message:'Vista previa no disponible'}); })
      .finally(()=>{ if(!cancelled) setPreviewLoading(false); });
    return()=>{cancelled=true;};
  },[selected?.id]);

  const decide=async(action:'approve'|'reject')=>{
    if(!selected||!canEdit) return;
    if(action==='reject'&&!observations.trim()){ setDecisionError('Debes ingresar una observación para rechazar.'); return; }
    setSaving(action); setDecisionError(null);
    try{
      const response=await fetch('/api/legal/documentos/review',{method:'POST',headers:{'Content-Type':'application/json'},credentials:'include',body:JSON.stringify({documentId:selected.id,action,observations})});
      const data=await response.json().catch(()=>null);
      if(!response.ok) throw new Error(data?.error||'No se pudo guardar la decisión');
      await load(false);
      setObservations('');
    }catch(err){setDecisionError(err instanceof Error?err.message:'No se pudo guardar la decisión');}
    finally{setSaving(null);}
  };

  const download=async()=>{
    if(!selected) return;
    const response=await fetch('/api/legal/documentos/download?id='+encodeURIComponent(selected.id),{credentials:'include'});
    const data=await response.json().catch(()=>null);
    if(response.ok&&data?.url) window.open(data.url,'_blank','noopener,noreferrer');
  };

  if(loading&&!payload) return <div className="p-6 text-sm text-muted-foreground">Cargando bandeja legal…</div>;
  if(error&&!payload) return <div className="rounded-md border border-destructive/30 p-4 text-sm text-destructive">{error}</div>;

  return <div className="space-y-4">
    <header className="flex flex-col gap-3 border-b pb-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-primary">Legal · Elías</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">Bandeja documental</h1>
        <p className="mt-1 text-sm text-muted-foreground">Modelo ChileFlota: revisar primero lo pendiente, ver el documento y decidir sin salir de la bandeja.</p>
      </div>
      <div className="flex gap-2"><Button variant="outline" asChild><Link href="/dashboard/legal/documentos/importar">Cargar documento</Link></Button></div>
    </header>

    <div className="grid gap-2 sm:grid-cols-3">
      {(['pending','approved','rejected'] as ReviewState[]).map((state)=>{
        const count=payload?.summary[state]||0;
        return <button key={state} onClick={()=>setFilter(state)} className={'rounded-md border px-4 py-3 text-left transition-colors '+(filter===state?'border-primary bg-primary/5':'hover:bg-muted/30')}>
          <div className="flex items-center justify-between"><span className="text-sm font-medium">{stateLabel[state]}</span><span className="text-xl font-semibold tabular-nums">{count}</span></div>
          <p className="mt-1 text-xs text-muted-foreground">{state==='pending'?'Requieren decisión':state==='approved'?'Documentos aprobados':'Devueltos con observación'}</p>
        </button>;
      })}
    </div>

    <div className="overflow-hidden rounded-lg border bg-card lg:grid lg:min-h-[680px] lg:grid-cols-[320px_minmax(0,1fr)_300px]">
      <aside className="border-b lg:border-b-0 lg:border-r">
        <div className="border-b p-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"/><Input value={search} onChange={(e)=>setSearch(e.target.value)} placeholder="Buscar documento…" className="pl-9"/></div>
        </div>
        <div className="max-h-[620px] overflow-y-auto">
          {filtered.length?filtered.map((doc)=>{
            const active=doc.id===selectedId;
            return <button key={doc.id} onClick={()=>setSelectedId(doc.id)} className={'w-full border-b px-3 py-3 text-left transition-colors '+(active?'bg-primary/5':'hover:bg-muted/30')}>
              <div className="flex items-start gap-3">
                <div className="mt-0.5 rounded-md border p-2"><FileText className="h-4 w-4 text-muted-foreground"/></div>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2"><p className="truncate text-sm font-medium">{doc.document_name}</p><span className="shrink-0 text-[11px] text-muted-foreground">{fmtDate(doc.uploaded_at)}</span></div>
                  <p className="mt-1 truncate text-xs text-muted-foreground">{doc.document_type_category} · {doc.uploaded_by}</p>
                  <div className="mt-2 flex items-center gap-2"><Badge variant={doc.review_state==='rejected'?'destructive':'outline'}>{stateLabel[doc.review_state]}</Badge>{doc.file_size_bytes?<span className="text-[11px] text-muted-foreground">{fmtSize(doc.file_size_bytes)}</span>:null}</div>
                </div>
              </div>
            </button>;
          }):<div className="p-8 text-center text-sm text-muted-foreground"><Inbox className="mx-auto mb-2 h-6 w-6"/>No hay documentos en esta bandeja.</div>}
        </div>
      </aside>

      <main className="min-w-0 border-b lg:border-b-0 lg:border-r">
        {selected?<div className="flex h-full flex-col">
          <div className="border-b px-4 py-3">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0"><h2 className="truncate text-base font-semibold">{selected.document_name}</h2><p className="mt-1 text-xs text-muted-foreground">{selected.document_type_category} · cargado por {selected.uploaded_by} · {fmtDate(selected.uploaded_at)}</p></div>
              <Button variant="outline" size="sm" onClick={download}><Download className="mr-2 h-4 w-4"/>Abrir archivo</Button>
            </div>
          </div>
          <div className="flex-1 overflow-auto bg-muted/15 p-4">
            {previewLoading?<div className="flex h-full min-h-[480px] items-center justify-center text-sm text-muted-foreground">Generando vista previa interna…</div>:null}
            {!previewLoading&&preview?.kind==='text'?<div className="mx-auto max-w-3xl rounded-md border bg-background p-6 shadow-sm"><pre className="whitespace-pre-wrap font-sans text-sm leading-7 text-foreground">{preview.text}</pre>{preview.truncated?<p className="mt-4 text-xs text-muted-foreground">Vista previa recortada. Abre el archivo para revisar el documento completo.</p>:null}</div>:null}
            {!previewLoading&&preview?.kind==='pdf'&&preview.url?<object data={preview.url+'#toolbar=1&navpanes=0'} type="application/pdf" className="h-[560px] w-full rounded-md border bg-white"/>:null}
            {!previewLoading&&preview?.kind==='image'&&preview.url?<div className="flex justify-center"><img src={preview.url} alt={selected.document_name} className="max-h-[560px] rounded-md border object-contain"/></div>:null}
            {!previewLoading&&preview?.kind==='unavailable'?<div className="flex min-h-[480px] flex-col items-center justify-center rounded-md border border-dashed bg-background text-center"><FileText className="mb-3 h-8 w-8 text-muted-foreground"/><p className="text-sm font-medium">Vista previa no disponible</p><p className="mt-1 max-w-md text-xs text-muted-foreground">{preview.reason||'Abre el archivo original para revisarlo.'}</p><Button className="mt-4" variant="outline" onClick={download}>Abrir archivo</Button></div>:null}
          </div>
        </div>:<div className="flex min-h-[520px] items-center justify-center text-sm text-muted-foreground">Selecciona un documento.</div>}
      </main>

      <aside className="p-4">
        {selected?<div className="space-y-4">
          <div><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Decisión</p><div className="mt-2 flex items-center gap-2"><Badge variant={selected.review_state==='rejected'?'destructive':'outline'}>{stateLabel[selected.review_state]}</Badge>{selected.provenance_status==='canonical'?<Badge variant="secondary">Canónico</Badge>:null}</div></div>
          <div className="space-y-1 text-xs text-muted-foreground"><p><span className="font-medium text-foreground">Tipo:</span> {selected.document_type}</p><p><span className="font-medium text-foreground">Versión:</span> {selected.version}</p>{selected.valid_until?<p><span className="font-medium text-foreground">Vigencia:</span> {fmtDate(selected.valid_until)}</p>:null}{selected.canonical_section?<p><span className="font-medium text-foreground">Sección:</span> {selected.canonical_section}</p>:null}</div>
          {selected.l1_observations?<div className="rounded-md border bg-muted/20 p-3"><p className="text-xs font-medium">Observación anterior</p><p className="mt-1 text-xs text-muted-foreground">{selected.l1_observations}</p></div>:null}
          {selected.review_state==='pending'&&canEdit?<div className="space-y-3 border-t pt-4">
            <div><label className="text-xs font-medium">Observación</label><Textarea value={observations} onChange={(e)=>{setObservations(e.target.value);setDecisionError(null);}} rows={5} placeholder="Opcional al aprobar; obligatoria al rechazar." className="mt-2 resize-none"/></div>
            {decisionError?<p className="text-xs text-destructive">{decisionError}</p>:null}
            <Button className="w-full" onClick={()=>decide('approve')} disabled={Boolean(saving)}><CheckCircle2 className="mr-2 h-4 w-4"/>{saving==='approve'?'Aprobando…':'Aprobar'}</Button>
            <Button className="w-full" variant="destructive" onClick={()=>decide('reject')} disabled={Boolean(saving)}><XCircle className="mr-2 h-4 w-4"/>{saving==='reject'?'Rechazando…':'Rechazar'}</Button>
          </div>:null}
          {selected.review_state==='pending'&&!canEdit?<p className="rounded-md border p-3 text-xs text-muted-foreground">Tu acceso es de lectura. La decisión requiere permiso de edición en Legal.</p>:null}
        </div>:null}
      </aside>
    </div>
  </div>;
}