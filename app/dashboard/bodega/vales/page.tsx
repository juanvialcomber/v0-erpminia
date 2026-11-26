'use client';
import { useEffect, useRef, useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Person = { id: string; full_name: string };
type Product = { id: string; product_code: string; name: string; unit: string };
type Line = { id: string; product_name: string; product_code: string; unit: string; quantity: string; delivered: string };
type Voucher = { id: string; folio: number; status: string; requested_by: string; receiver_id: string; work_order_id: string; reason: string; decision_reason: string; expires_at: string; created_at: string; qr_reference: string; warehouse_consumption_voucher_lines: Line[] };
type Data = { requesters: {profile_id:string;expires_at:string;profiles:{full_name:string}}[]; rows: Voucher[]; users: Person[]; warehouses: {id:string;name:string}[]; orders: {id:string;work_order_number:string;title:string}[]; actorId: string; access: {can_request:boolean;can_approve:boolean;can_deliver:boolean}; settings: {deliveries_enabled:boolean} };
const labels: Record<string,string> = { pending:'Por aprobar', approved:'Aprobado', rejected:'Rechazado', delivered:'Entregado', cancelled:'Anulado' };
async function fetcher(url:string) { const r=await fetch(url,{cache:'no-store'}); const d=await r.json(); if(!r.ok) throw new Error(d.error); return d; }
export default function ValesPage() {
 const [qr,setQr]=useState('');
 useEffect(()=>{setQr(new URLSearchParams(window.location.search).get('qr')||'');},[]);
 const {data,error,isLoading,mutate}=useSWR<Data>(`/api/bodega/vales${qr?'?qr='+encodeURIComponent(qr):''}`,fetcher);
 const [creating,setCreating]=useState(false),[order,setOrder]=useState(''),[receiver,setReceiver]=useState(''),[reason,setReason]=useState(''),[search,setSearch]=useState('');
 const [products,setProducts]=useState<Product[]>([]),[lines,setLines]=useState<(Product&{quantity:string})[]>([]);
 const [busy,setBusy]=useState(false),[message,setMessage]=useState('');
 const retry=useRef<{fingerprint:string;id:string}|null>(null);
 const searchVersion=useRef(0);
 const person=(id:string)=>data?.users.find(p=>p.id===id)?.full_name||'Usuario no disponible';
 const ot=(id:string)=>data?.orders.find(p=>p.id===id)?.work_order_number||'OT vinculada';
 async function command(action:string,payload:Record<string,unknown>) {
  const fingerprint=JSON.stringify({action,payload});
  if(retry.current?.fingerprint!==fingerprint) retry.current={fingerprint,id:crypto.randomUUID()};
  setBusy(true);setMessage('');
  try { const r=await fetch('/api/bodega/vales',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,payload:{...payload,requestId:retry.current.id}})}); const d=await r.json(); if(!r.ok) throw new Error(d.error); retry.current=null;setMessage('Vale actualizado.');if(action==='create'){setCreating(false);setLines([]);setReason('');}await mutate(); }
  catch(e){setMessage(e instanceof Error?e.message:'No se pudo registrar. Reintenta con los mismos datos.');}
  finally{setBusy(false);}
 }
 async function findProducts(){const version=++searchVersion.current;try{const d=await fetcher('/api/bodega/vales?mode=catalog&q='+encodeURIComponent(search));if(version===searchVersion.current)setProducts(d.rows||[]);}catch(e){setMessage(e instanceof Error?e.message:'No se pudo buscar.');}}
 function scan(value:string){try {const url=new URL(value,window.location.origin);if(url.origin!==window.location.origin||url.pathname!=='/dashboard/bodega/vales')throw new Error();const ref=url.searchParams.get('qr');if(!ref)throw new Error();setQr(ref);}catch{setMessage('Abre el enlace QR del vale de MOTIL.');}}
 if(isLoading)return <p role="status">Cargando vales…</p>;
 if(error)return <section className="space-y-4"><h1 className="text-2xl font-semibold">Vales de consumo</h1><p role="alert">{error.message}</p><Button onClick={()=>mutate()}>Reintentar</Button></section>;
 if(!data)return null;
 return <section className="space-y-6 max-w-5xl">
  <header className="space-y-3"><h1 className="text-2xl font-semibold">Vales de consumo</h1><p className="text-sm text-muted-foreground">Solicita materiales para una OT. Bodega aprueba y confirma la entrega al receptor identificado.</p>{data.access.can_request&&<Button disabled={busy} onClick={()=>setCreating(!creating)}>{creating?'Cerrar solicitud':'Solicitar materiales'}</Button>}</header>
  <p role="status" aria-live="polite">{message}</p>
  {!data.settings.deliveries_enabled&&<p className="text-sm text-muted-foreground">Puedes preparar y revisar vales. La entrega queda pendiente de habilitar el inventario verificado.</p>}
  <details className="border rounded-lg p-4"><summary>Quiénes pueden solicitar materiales</summary><ul className="mt-3 space-y-2">{data.requesters.map(p=><li key={p.profile_id}>{p.profiles.full_name} · hasta {new Date(p.expires_at).toLocaleDateString('es-CL',{timeZone:'America/Santiago'})}</li>)}</ul></details>
  <details className="border rounded-lg p-4"><summary>Buscar vale con QR</summary><p className="text-sm my-3">Escanea el QR con la cámara del teléfono para abrir el vale o pega el enlace desde un lector.</p><form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);scan(String(f.get('link')||''));}} className="flex gap-2"><Input name="link" aria-label="Enlace del vale QR" placeholder="Enlace del vale" required/><Button variant="outline">Buscar</Button></form>{qr&&<Button variant="ghost" onClick={()=>setQr('')}>Ver todos mis vales</Button>}</details>
  {creating&&<form className="space-y-4 border rounded-lg p-4" onSubmit={e=>{e.preventDefault();command('create',{warehouseId:data.warehouses[0]?.id,workOrderId:order,receiverId:receiver,reason,lines:lines.map(l=>({productId:l.id,quantity:l.quantity}))});}}>
   <h2 className="text-lg font-semibold">Nueva solicitud</h2>
   <Label htmlFor="order">Orden de trabajo</Label><select id="order" className="w-full border rounded bg-background p-2" required value={order} onChange={e=>setOrder(e.target.value)}><option value="">Selecciona una OT</option>{data.orders.map(o=><option key={o.id} value={o.id}>{o.work_order_number} · {o.title}</option>)}</select>
   <Label htmlFor="receiver">Quién retirará los materiales</Label><select id="receiver" className="w-full border rounded bg-background p-2" required value={receiver} onChange={e=>setReceiver(e.target.value)}><option value="">Selecciona receptor</option>{data.users.map(p=><option key={p.id} value={p.id}>{p.full_name}</option>)}</select>
   <Label htmlFor="reason">Motivo</Label><Input id="reason" required minLength={3} maxLength={500} value={reason} onChange={e=>setReason(e.target.value)}/>
   <Label htmlFor="material">Material</Label><div className="flex gap-2"><Input id="material" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Código o nombre"/><Button type="button" variant="outline" disabled={search.trim().length<2} onClick={findProducts}>Buscar</Button></div>
   {products.length>0&&<ul className="max-h-64 overflow-y-auto border rounded p-2">{products.map(p=><li key={p.id}><Button type="button" variant="ghost" disabled={lines.length>=15||lines.some(l=>l.id===p.id)} onClick={()=>{setLines([...lines,{...p,quantity:'1'}]);setProducts([]);setSearch('');}}>{p.product_code} · {p.name} ({p.unit})</Button></li>)}</ul>}
   {lines.map((l,i)=><div key={l.id} className="grid grid-cols-[1fr_6rem_auto] gap-2 items-center"><span>{l.product_code} · {l.name} ({l.unit})</span><Input aria-label={'Cantidad de '+l.name} inputMode="decimal" required value={l.quantity} onChange={e=>setLines(lines.map((x,j)=>j===i?{...x,quantity:e.target.value}:x))}/><Button type="button" variant="ghost" onClick={()=>setLines(lines.filter(x=>x.id!==l.id))}>Quitar</Button></div>)}
   <p className="text-sm">Solicita: {person(data.actorId)} · Bodega Central · {lines.length}/15 materiales</p>
   <Button disabled={busy||!lines.length||!data.warehouses.length}>{busy?'Registrando…':'Enviar a Bodega'}</Button>
  </form>}
  {!data.rows.length&&<p>No hay vales para mostrar.</p>}
  {data.rows.map(v=><article key={v.id} className="border rounded-lg p-4 space-y-3">
   <div className="flex justify-between gap-3"><h2 className="font-semibold">Vale VC-{String(v.folio).padStart(6,'0')} · {ot(v.work_order_id)}</h2><span>{labels[v.status]}</span></div>
   <p className="text-sm">Solicita: {person(v.requested_by)} · Retira: {person(v.receiver_id)}</p><p>{v.reason}</p><p className="text-sm text-muted-foreground">Vence: {new Date(v.expires_at).toLocaleString('es-CL',{timeZone:'America/Santiago'})}</p>
   <ul>{v.warehouse_consumption_voucher_lines.map(l=><li key={l.id} className="border-t py-2">{l.product_code} · {l.product_name}: {Number(l.delivered).toLocaleString('es-CL')} / {Number(l.quantity).toLocaleString('es-CL')} {l.unit}
    {v.status==='approved'&&data.access.can_deliver&&data.settings.deliveries_enabled&&data.actorId!==v.requested_by&&qr===v.qr_reference&&Number(l.delivered)<Number(l.quantity)&&<form className="flex flex-wrap gap-2 items-center mt-2" onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);command('deliver',{voucherId:v.id,lineId:l.id,qrReference:qr,receiverId:v.receiver_id,physicalConfirmed:true,quantity:String(f.get('quantity')).replace(',','.')});}}><Input className="w-28" name="quantity" aria-label={'Cantidad a entregar de '+l.product_name} inputMode="decimal" required/><label className="text-sm"><input type="checkbox" required/> Confirmo entrega física a {person(v.receiver_id)}</label><Button disabled={busy}>Confirmar entrega</Button></form>}
   </li>)}</ul>
   {v.decision_reason&&<p className="text-sm">Decisión de Bodega: {v.decision_reason}</p>}
   {v.status==='pending'&&data.access.can_approve&&v.requested_by!==data.actorId&&<form onSubmit={e=>{e.preventDefault();const f=new FormData(e.currentTarget);const action=(e.nativeEvent as SubmitEvent).submitter?.getAttribute('value')||'reject';command(action,{voucherId:v.id,reason:String(f.get('reason'))});}} className="flex flex-wrap gap-2"><Input name="reason" aria-label="Motivo de la decisión" required minLength={3} maxLength={500}/><Button name="action" value="approve" disabled={busy}>Aprobar</Button><Button name="action" value="reject" variant="outline" disabled={busy}>Rechazar</Button></form>}
   {v.status==='approved'&&Date.parse(v.expires_at)>Date.now()&&<div><img src={'/api/bodega/vales/qr?id='+encodeURIComponent(v.id)} alt="QR para abrir este vale aprobado" width={256} height={256}/><p className="text-sm">Presenta este QR en Bodega. El retiro requiere confirmación del encargado.</p><Button variant="outline" onClick={()=>navigator.clipboard.writeText(window.location.origin+'/dashboard/bodega/vales?qr='+v.qr_reference).then(()=>setMessage('Enlace copiado.')).catch(()=>setMessage('No se pudo copiar el enlace.'))}>Copiar enlace</Button></div>}
   {['pending','approved'].includes(v.status)&&!v.warehouse_consumption_voucher_lines.some(l=>Number(l.delivered)>0)&&(v.requested_by===data.actorId||data.access.can_approve)&&<Button variant="ghost" disabled={busy} onClick={()=>{if(window.confirm('¿Anular este vale?'))command('cancel',{voucherId:v.id});}}>Anular vale</Button>}
  </article>)}
 </section>;
}
