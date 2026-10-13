'use client';
import {useCallback,useEffect,useState} from 'react';
import Link from 'next/link';
import {Button} from '@/components/ui/button';
type Folder={id:string;empresa_nombre:string;status:string};
type Doc={slot_index:number;documento_nombre:string;file_name:string|null};
type Decision={slot_index:number;applicability:string;rationale:string|null;legal_basis:string|null;evidence_reference:string|null};
export default function EeccApplicabilityPage(){
 const [folders,setFolders]=useState<Folder[]>([]);
 const [selected,setSelected]=useState('');
 const [docs,setDocs]=useState<Doc[]>([]);
 const [decisions,setDecisions]=useState<Decision[]>([]);
 const [error,setError]=useState('');
 const [saving,setSaving]=useState<number|null>(null);
 const [loading,setLoading]=useState(true);
 const refresh=useCallback(async(id:string)=>{
  if(!id)return;
  const [a,b]=await Promise.all([fetch('/api/carpeta-arranque/'+id,{credentials:'include'}),fetch('/api/carpeta-arranque/'+id+'/applicability',{credentials:'include'})]);
  if(!a.ok||!b.ok)throw Error('No se pudo cargar la evaluación normativa');
  setDocs((await a.json()).documentos||[]);setDecisions((await b.json()).decisions||[]);
 },[]);
 useEffect(()=>{fetch('/api/carpeta-arranque',{credentials:'include'}).then(async r=>{if(!r.ok)throw Error('Sin acceso a carpetas');return r.json()}).then(d=>setFolders(d.carpetas||[])).catch(e=>setError(e.message)).finally(()=>setLoading(false))},[]);
 async function choose(id:string){setSelected(id);setError('');try{await refresh(id)}catch(e){setError((e as Error).message)}}
 function update(index:number,patch:Partial<Decision>){setDecisions(prev=>{const old=prev.find(d=>d.slot_index===index)||{slot_index:index,applicability:'pendiente',rationale:null,legal_basis:null,evidence_reference:null};return [...prev.filter(d=>d.slot_index!==index),{...old,...patch}]})}
 async function save(index:number){
  const d=decisions.find(x=>x.slot_index===index);if(!d)return;
  setSaving(index);setError('');
  try{
   const r=await fetch('/api/carpeta-arranque/'+selected+'/applicability',{method:'PUT',headers:{'content-type':'application/json'},credentials:'include',body:JSON.stringify(d)});
   const data=await r.json();if(!r.ok)throw Error(data.error||'No se pudo guardar');
   await refresh(selected);
  }catch(e){setError((e as Error).message)}finally{setSaving(null)}
 }
 const pending=docs.filter(d=>!['aplica','no_aplica'].includes(decisions.find(x=>x.slot_index===d.slot_index)?.applicability||'')).length;
 return <main className="space-y-5 p-4 md:p-6">
  <header className="border-b pb-4"><p className="text-xs uppercase tracking-widest text-muted-foreground">Legal / Contratistas</p><h1 className="mt-1 text-2xl font-semibold">Aplicabilidad documental</h1><p className="mt-1 text-sm text-muted-foreground">Determina qué antecedentes corresponden al trabajo real. La aprobación documental no habilita el ingreso a faena.</p></header>
  <label className="block max-w-lg space-y-2 text-sm font-medium">Empresa
   <select aria-label="Empresa contratista" className="w-full rounded-md border bg-background p-3" value={selected} onChange={e=>void choose(e.target.value)}><option value="">Seleccionar contratista</option>{folders.map(f=><option key={f.id} value={f.id}>{f.empresa_nombre}</option>)}</select>
  </label>
  {loading?<p role="status">Cargando empresas…</p>:null}
  {error?<p role="alert" className="text-sm text-destructive">{error}</p>:null}
  {selected?<><div className="flex flex-wrap items-center justify-between gap-2 text-sm"><p>{pending} decisiones pendientes de {docs.length}</p><Link className="underline" href="/dashboard/legal/contratistas-documentos">Ir a revisión documental</Link></div>
   <div className="divide-y rounded-md border">{docs.map(doc=>{const d=decisions.find(x=>x.slot_index===doc.slot_index);return <section key={doc.slot_index} className="space-y-3 p-4">
    <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{doc.slot_index}. {doc.documento_nombre}</h2><span className="text-xs text-muted-foreground">{doc.file_name?'Archivo cargado':'Sin archivo'}</span></div>
    <div className="grid gap-3 md:grid-cols-3">
     <label className="space-y-1 text-xs">Aplicabilidad<select className="w-full rounded-md border bg-background p-2 text-sm" value={d?.applicability||'pendiente'} onChange={e=>update(doc.slot_index,{applicability:e.target.value})}><option value="pendiente">Pendiente</option><option value="aplica">Aplica</option><option value="no_aplica">No aplica</option></select></label>
     <label className="space-y-1 text-xs">Fundamento / motivo<input className="w-full rounded-md border bg-background p-2 text-sm" value={d?.rationale||''} onChange={e=>update(doc.slot_index,{rationale:e.target.value})} placeholder="Por qué aplica o no aplica"/></label>
     <label className="space-y-1 text-xs">Norma / criterio<input className="w-full rounded-md border bg-background p-2 text-sm" value={d?.legal_basis||''} onChange={e=>update(doc.slot_index,{legal_basis:e.target.value})} placeholder="D.S. 76, D.S. 132 o protocolo"/></label>
    </div>
    <div className="flex justify-end"><Button size="sm" disabled={saving!==null} onClick={()=>void save(doc.slot_index)}>{saving===doc.slot_index?'Guardando…':'Guardar decisión'}</Button></div>
   </section>})}</div></>:null}
 </main>;
}
