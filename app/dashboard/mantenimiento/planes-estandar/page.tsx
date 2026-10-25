'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { CheckCircle2, ClipboardCheck, Plus, RefreshCw, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type Plan = { id:string; plan_code:string; name:string; work_type:string; status:string; estimated_duration_hours:number|null; labor_people_required:number|null; skill_requirement:string|null; safety_controls:string|null; required_document_reference:string|null; reason:string; evidence_reference:string|null; asset:any; steps:any[]; materials:any[]; applications:any[] };
type Data = { counts:{total:number;approved:number;proposed:number;activeApplications:number}; items:Plan[]; canEdit?: boolean };
type DraftMaterial = { productCode:string; productName?:string|null; unit?:string|null; quantityRequired:string; sourceStatus?:string|null };
const fetcher=async(url:string)=>{const r=await fetch(url,{credentials:'include'});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||'No se pudo cargar');return p as Data;};
function parsePrefilledMaterials(raw:string|null):DraftMaterial[]{
 if(!raw)return[];
 try{
  const parsed=JSON.parse(raw);
  if(!Array.isArray(parsed))return[];
  return parsed.map((row:any)=>({
   productCode:String(row?.productCode||'').trim(),
   productName:row?.productName?String(row.productName):null,
   unit:row?.unit?String(row.unit):null,
   quantityRequired:String(Number(row?.quantityRequired||0)>0?Number(row.quantityRequired):1),
   sourceStatus:row?.sourceStatus?String(row.sourceStatus):null
  })).filter((row:DraftMaterial)=>row.productCode);
 }catch{return[];}
}

export default function StandardJobPlansPage(){
 const searchParams=useSearchParams();
 const prefilledAssetCode=searchParams.get('assetCode')||'';
 const prefilledAssetName=searchParams.get('assetName')||'';
 const prefilledName=searchParams.get('name')||'';
 const prefilledWorkType=searchParams.get('workType')||'preventivo';
 const prefilledDurationHours=searchParams.get('durationHours')||'';
 const prefilledReason=searchParams.get('reason')||'';
 const prefilledEvidence=searchParams.get('evidence')||'';
 const prefilledMaterials=parsePrefilledMaterials(searchParams.get('materials'));
 const openNewPlan=searchParams.get('new')==='1';
 const {data,error,isLoading,mutate}=useSWR('/api/maintenance/standard-job-plans',fetcher,{revalidateOnFocus:false});
 const [showForm,setShowForm]=useState(openNewPlan); const [message,setMessage]=useState<string|null>(null); const [saving,setSaving]=useState(false); const [query,setQuery]=useState('');
 const [materials,setMaterials]=useState<DraftMaterial[]>(prefilledMaterials.length?prefilledMaterials:[{productCode:'',quantityRequired:'1'}]);
 const [form,setForm]=useState({
  planCode:'',
  name:prefilledName||(prefilledAssetName?`Plan de mantención · ${prefilledAssetName}`:''),
  workType:prefilledWorkType,
  assetCode:prefilledAssetCode,
  assetType:'',
  estimatedDurationHours:prefilledDurationHours,
  laborPeopleRequired:'',
  skillRequirement:'',
  safetyControls:'',
  requiredDocumentReference:'',
  reason:prefilledReason,
  evidenceReference:prefilledEvidence,
  stepTitle:'',
  stepInstructions:'',
  stepControl:''
 });
 const filtered=useMemo(()=> (data?.items||[]).filter(p=>!query.trim()||`${p.plan_code} ${p.name} ${p.work_type} ${p.asset?.asset_code||''}`.toLowerCase().includes(query.toLowerCase())),[data?.items,query]);
 async function submit(e:FormEvent){e.preventDefault();setSaving(true);setMessage(null);const materialPayload=materials.filter(row=>row.productCode.trim()).map(row=>({productCode:row.productCode.trim(),quantityRequired:Number(row.quantityRequired||1)}));const r=await fetch('/api/maintenance/standard-job-plans',{method:'POST',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({planCode:form.planCode,name:form.name,workType:form.workType,assetCode:form.assetCode||null,assetType:form.assetType||null,estimatedDurationHours:form.estimatedDurationHours?Number(form.estimatedDurationHours):null,laborPeopleRequired:form.laborPeopleRequired?Number(form.laborPeopleRequired):null,skillRequirement:form.skillRequirement,safetyControls:form.safetyControls,requiredDocumentReference:form.requiredDocumentReference,reason:form.reason,evidenceReference:form.evidenceReference,steps:[{title:form.stepTitle,instructions:form.stepInstructions,controlRequirement:form.stepControl}],materials:materialPayload})});const p=await r.json().catch(()=>null);setSaving(false);if(!r.ok){setMessage(p?.error||'No se pudo guardar.');return;}setMessage('Plan propuesto. Debe aprobarse antes de aplicarlo.');setShowForm(false);await mutate();}
 async function approve(id:string){const r=await fetch('/api/maintenance/standard-job-plans',{method:'PATCH',credentials:'include',headers:{'content-type':'application/json'},body:JSON.stringify({id,status:'approved'})});const p=await r.json().catch(()=>null);if(!r.ok){setMessage(p?.error||'No se pudo aprobar.');return;}setMessage('Plan aprobado. Ya puede vincularse a una OT o preventivo.');await mutate();}
 const c=data?.counts;
 return <div className="space-y-6">
  <section className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between"><div><p className="text-sm font-medium text-muted-foreground">Mantenimiento · Estandarización</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Planes estándar de trabajo</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Define pasos, controles, documentación, mano de obra y materiales verificables. Un plan aprobado prepara la OT sin reemplazarla ni inventar consumos.</p></div><div className="flex gap-2"><Button variant="outline" onClick={()=>void mutate()}><RefreshCw className="mr-2 h-4 w-4"/>Actualizar</Button>{data?.canEdit?<Button onClick={()=>setShowForm(v=>!v)}><Plus className="mr-2 h-4 w-4"/>Proponer plan</Button>:null}</div></section>
  {message&&<Card className="shadow-none"><CardContent className="p-4 text-sm">{message}</CardContent></Card>}
  {openNewPlan&&prefilledEvidence&&<Card className="shadow-none"><CardContent className="p-4"><p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Propuesta desde planificación</p><p className="mt-2 text-sm">{prefilledEvidence}</p>{prefilledMaterials.length>0?<p className="mt-1 text-xs text-muted-foreground">{prefilledMaterials.length} material(es) requeridos en la OT fuente fueron cargados para revisión. No representan consumo futuro ni stock disponible.</p>:null}<p className="mt-1 text-xs text-muted-foreground">MOTIL prellena sólo campos sustentados. Ariel debe completar pasos, controles y personas, y confirmar o quitar materiales antes de aprobar.</p></CardContent></Card>}
  <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[['Planes',c?.total||0],['Aprobados',c?.approved||0],['Propuestos',c?.proposed||0],['Aplicaciones activas',c?.activeApplications||0]].map(([l,v])=><Card key={String(l)} className="shadow-none"><CardContent className="p-4"><p className="text-2xl font-semibold">{Number(v).toLocaleString('es-CL')}</p><p className="mt-1 text-xs text-muted-foreground">{l}</p></CardContent></Card>)}</div>
  {openNewPlan && data && !data.canEdit ? <Card className="shadow-none"><CardContent className="p-4 text-sm text-muted-foreground">No tienes permisos de edición para crear planes de mantención.</CardContent></Card> : null}
  {showForm&&data?.canEdit&&<Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Nuevo plan estándar</CardTitle></CardHeader><CardContent><form onSubmit={submit} className="grid gap-4 md:grid-cols-2"><div className="space-y-2"><Label>Código</Label><Input value={form.planCode} onChange={e=>setForm({...form,planCode:e.target.value})}/></div><div className="space-y-2"><Label>Nombre</Label><Input value={form.name} onChange={e=>setForm({...form,name:e.target.value})}/></div><div className="space-y-2"><Label>Tipo de trabajo</Label><Select value={form.workType} onValueChange={v=>setForm({...form,workType:v})}><SelectTrigger><SelectValue/></SelectTrigger><SelectContent><SelectItem value="preventivo">Preventivo</SelectItem><SelectItem value="correctivo">Correctivo</SelectItem><SelectItem value="predictivo">Predictivo</SelectItem><SelectItem value="inspeccion">Inspección</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Equipo exacto (opcional)</Label><Input placeholder="Código canónico" value={form.assetCode} onChange={e=>setForm({...form,assetCode:e.target.value})}/></div><div className="space-y-2"><Label>Duración estimada (h)</Label><Input type="number" min="0" step="0.1" value={form.estimatedDurationHours} onChange={e=>setForm({...form,estimatedDurationHours:e.target.value})}/></div><div className="space-y-2"><Label>Personas requeridas</Label><Input type="number" min="1" value={form.laborPeopleRequired} onChange={e=>setForm({...form,laborPeopleRequired:e.target.value})}/></div><div className="space-y-2"><Label>Competencia requerida</Label><Input value={form.skillRequirement} onChange={e=>setForm({...form,skillRequirement:e.target.value})}/></div><div className="space-y-2"><Label>Documento requerido</Label><Input value={form.requiredDocumentReference} onChange={e=>setForm({...form,requiredDocumentReference:e.target.value})}/></div><div className="space-y-2 md:col-span-2"><Label>Controles de seguridad</Label><Textarea rows={2} value={form.safetyControls} onChange={e=>setForm({...form,safetyControls:e.target.value})}/></div><div className="space-y-2"><Label>Primer paso</Label><Input value={form.stepTitle} onChange={e=>setForm({...form,stepTitle:e.target.value})}/></div><div className="space-y-2"><Label>Control del paso</Label><Input value={form.stepControl} onChange={e=>setForm({...form,stepControl:e.target.value})}/></div><div className="space-y-2 md:col-span-2"><Label>Instrucción del paso</Label><Textarea rows={2} value={form.stepInstructions} onChange={e=>setForm({...form,stepInstructions:e.target.value})}/></div><div className="space-y-3 md:col-span-2"><div className="flex items-center justify-between gap-3"><Label>Materiales canónicos (opcionales)</Label><Button type="button" variant="outline" size="sm" onClick={()=>setMaterials(rows=>[...rows,{productCode:'',quantityRequired:'1'}])}><Plus className="mr-1 h-3.5 w-3.5"/>Agregar material</Button></div><div className="space-y-2">{materials.map((material,index)=><div key={`${material.productCode}-${index}`} className="grid gap-2 rounded-md border p-3 md:grid-cols-[minmax(0,1fr)_140px_auto] md:items-end"><div className="space-y-1"><Label className="text-xs">Código canónico</Label><Input placeholder="Código exacto" value={material.productCode} onChange={e=>setMaterials(rows=>rows.map((row,i)=>i===index?{...row,productCode:e.target.value}:row))}/>{material.productName?<p className="text-xs text-muted-foreground">{material.productName}{material.unit?` · ${material.unit}`:''}</p>:null}</div><div className="space-y-1"><Label className="text-xs">Cantidad</Label><Input type="number" min="0.001" step="0.001" value={material.quantityRequired} onChange={e=>setMaterials(rows=>rows.map((row,i)=>i===index?{...row,quantityRequired:e.target.value}:row))}/></div><Button type="button" variant="ghost" size="sm" onClick={()=>setMaterials(rows=>rows.length===1?[{productCode:'',quantityRequired:'1'}]:rows.filter((_,i)=>i!==index))}>Quitar</Button></div>)}</div>{prefilledMaterials.length>0?<p className="text-xs text-muted-foreground">Estos materiales provienen de requerimientos observados en la OT fuente. Ariel debe confirmar pertinencia y cantidad para el plan.</p>:null}</div><div className="space-y-2 md:col-span-2"><Label>Fundamento</Label><Textarea rows={2} value={form.reason} onChange={e=>setForm({...form,reason:e.target.value})}/></div><div className="space-y-2 md:col-span-2"><Label>Evidencia</Label><Input value={form.evidenceReference} onChange={e=>setForm({...form,evidenceReference:e.target.value})}/></div><div className="md:col-span-2 flex gap-2"><Button disabled={saving}>Guardar propuesta</Button><Button type="button" variant="ghost" onClick={()=>setShowForm(false)}>Cancelar</Button></div></form></CardContent></Card>}
  <Input placeholder="Buscar plan, código, tipo o equipo" value={query} onChange={e=>setQuery(e.target.value)}/>
  <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Planes · {filtered.length}</CardTitle></CardHeader><CardContent className="p-0">{error?<div className="p-6 text-sm text-muted-foreground">No se pudieron cargar los planes.</div>:isLoading?<div className="p-6 text-sm text-muted-foreground">Cargando…</div>:filtered.length===0?<div className="p-8 text-center text-sm text-muted-foreground"><ClipboardCheck className="mx-auto mb-3 h-5 w-5"/>No hay planes estándar registrados.</div>:<div className="divide-y border-t">{filtered.map(p=><div key={p.id} className="p-4"><div className="flex flex-col gap-3 lg:flex-row lg:justify-between"><div><div className="flex flex-wrap gap-2"><Badge variant={p.status==='approved'?'default':'secondary'}>{p.status==='approved'?'Aprobado':p.status==='proposed'?'Propuesto':p.status}</Badge><Badge variant="outline">{p.work_type}</Badge></div><p className="mt-3 font-medium">{p.plan_code} · {p.name}</p><p className="mt-1 text-sm text-muted-foreground">{p.asset?`${p.asset.asset_code} · ${p.asset.name}`:'Aplicación general controlada'} · {p.steps.length} paso(s) · {p.materials.length} material(es)</p><p className="mt-1 text-xs text-muted-foreground">Duración: {p.estimated_duration_hours??'Sin dato'} h · Personas: {p.labor_people_required??'Sin dato'} · Aplicaciones: {p.applications.length}</p>{p.safety_controls&&<p className="mt-2 text-sm">Control: {p.safety_controls}</p>}{p.required_document_reference&&<p className="mt-1 text-sm">Documento: {p.required_document_reference}</p>}<div className="mt-3 space-y-1 text-sm">{p.steps.map((s:any)=><p key={s.id}>{s.sequence_no}. {s.title}{s.control_requirement?` · ${s.control_requirement}`:''}</p>)}</div>{p.materials.length>0&&<div className="mt-3 space-y-1 text-sm">{p.materials.map((m:any)=><p key={m.id}><Wrench className="mr-1 inline h-3.5 w-3.5"/>{m.product?.product_code||'Producto'} · {m.product?.name||'Sin nombre'} · {Number(m.quantity_required).toLocaleString('es-CL')} {m.product?.unit||''}</p>)}</div>}</div><div className="shrink-0">{p.status==='proposed'&&data?.canEdit&&<Button size="sm" onClick={()=>void approve(p.id)}><CheckCircle2 className="mr-2 h-4 w-4"/>Aprobar</Button>}</div></div></div>)}</div>}</CardContent></Card>
  <p className="text-xs text-muted-foreground">La aplicación a OT/preventivos se realiza mediante el API operacional. Los materiales solo crean requerimientos faltantes; nunca reemplazan cantidades existentes.</p>
 </div>;
}
