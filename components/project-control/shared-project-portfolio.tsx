'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';

type Project = { id:string; project_name:string; requesting_area:string; status:string; target_date:string|null; allocated_clp:string|null; contract_count:number; physical_progress_pct:number|null };
type Center = { id:string; name:string; budget_clp:string; allocated_clp:string; unallocated_clp:string };
type Portfolio = { area:'engineering'|'legal'|'finance'; year:number; budget_version:number|null; centers:Center[]; projects:Project[]; project_total:number; accounting_connected:boolean; commitments_connected:boolean };
const pesos = (value:string|null) => value===null ? 'Sin asignar' : /^-?\d+$/.test(value) ? '$ '+BigInt(value).toLocaleString('es-CL') : 'No verificable';
const descriptions = { engineering:'Revisa la cartera y el avance físico.', legal:'Revisa los proyectos y sus vínculos contractuales.', finance:'Revisa las asignaciones del presupuesto y su distribución por centro de costo.' };

export function SharedProjectPortfolio(){
 const [open,setOpen]=useState(false);
 const [year,setYear]=useState(2027);
 const [retry,setRetry]=useState(0);
 const [result,setResult]=useState<{year:number;retry:number;data?:Portfolio;error?:number}|null>(null);
 useEffect(()=>{
   if(!open)return;
   const controller=new AbortController();
   let active=true;
   fetch('/api/project-control/portfolio?year='+year,{credentials:'include',cache:'no-store',signal:controller.signal})
     .then(async response=>{
       if(!response.ok){if(active)setResult({year,retry,error:response.status});return;}
       const data:Portfolio=await response.json();
       if(!Array.isArray(data.projects)||!Array.isArray(data.centers)||!Object.hasOwn(descriptions,data.area)||data.year!==year)throw new Error('Invalid portfolio');
       if(active)setResult({year,retry,data});
     })
     .catch(()=>{if(active)setResult({year,retry,error:503});});
   return ()=>{active=false;controller.abort();};
 },[open,year,retry]);
 const current=result?.year===year&&result.retry===retry?result:null;
 const data=current?.data;
 return <section className="rounded-lg border bg-card" aria-label="Cartera compartida de proyectos">
   <details onToggle={event=>{setOpen(event.currentTarget.open);setResult(null);}}>
     <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Control de proyectos y presupuesto<span className="mt-1 block text-xs font-normal text-muted-foreground">Cartera compartida entre Ingeniería, Legal y Finanzas</span></summary>
     {open?<div className="space-y-4 border-t p-4">
       <div className="flex flex-wrap items-center justify-between gap-3">
         <label className="flex items-center gap-2 text-sm">Año presupuestario<select className="min-h-10 rounded-md border bg-background px-3" value={year} onChange={event=>setYear(Number(event.target.value))}>{Array.from({length:5},(_,i)=>2027+i).map(y=><option key={y} value={y}>{y}</option>)}</select></label>
         <Button variant="outline" size="sm" onClick={()=>setRetry(n=>n+1)}>Actualizar</Button>
       </div>
       {!current?<p role="status" className="text-sm text-muted-foreground">Consultando cartera…</p>:current.error?<p role="status" className="text-sm text-muted-foreground">{current.error===401||current.error===403?'No tienes acceso a esta cartera.':'No se pudo consultar la cartera. Usa Actualizar para reintentar.'}</p>:data?<>
         <p className="text-sm text-muted-foreground">{descriptions[data.area]}</p>
         <div className="grid grid-cols-2 gap-3 border-y py-3">
           <div><p className="text-xs text-muted-foreground">Proyectos registrados</p><p className="text-xl font-semibold tabular-nums">{data.project_total}</p></div>
           <div><p className="text-xs text-muted-foreground">Presupuesto vigente</p><p className="text-sm font-semibold">{data.budget_version===null?'Pendiente de aprobación':'Versión '+data.budget_version}</p></div>
         </div>
         {!data.accounting_connected||!data.commitments_connected?<p className="text-xs text-muted-foreground">Ejecución contable y compromisos aún no conciliados. Las asignaciones no representan gasto ni saldo disponible para gastar.</p>:null}
         {data.projects.length===0?<p className="text-sm text-muted-foreground">Ingeniería aún no ha registrado proyectos en esta cartera.</p>:<div className="divide-y rounded-md border">{data.projects.map(p=><article key={p.id} className="grid gap-3 p-3 md:grid-cols-[minmax(0,1.5fr)_repeat(3,minmax(0,1fr))]">
           <div><h3 className="break-words text-sm font-medium">{p.project_name}</h3><p className="text-xs text-muted-foreground">{p.requesting_area} · {p.status==='draft'?'Borrador':'En revisión'}</p></div>
           <div><p className="text-xs text-muted-foreground">Asignación CLP</p><p className="break-words text-sm font-medium tabular-nums">{pesos(p.allocated_clp)}</p></div>
           <div><p className="text-xs text-muted-foreground">Avance físico</p><p className="text-sm">{p.physical_progress_pct===null?'Sin registro':p.physical_progress_pct+'%'}</p></div>
           <div><p className="text-xs text-muted-foreground">Contratos vinculados</p><p className="text-sm">{p.contract_count}</p></div>
         </article>)}</div>}
         {data.project_total>data.projects.length?<p className="text-xs text-muted-foreground">Mostrando {data.projects.length} de {data.project_total} proyectos.</p>:null}
         {data.budget_version!==null?<details className="rounded-md border"><summary className="cursor-pointer px-3 py-3 text-sm font-medium">Distribución por centro de costo</summary><div className="divide-y border-t">{data.centers.length?data.centers.map(c=><div key={c.id} className="grid gap-2 p-3 sm:grid-cols-2 lg:grid-cols-4"><p className="break-words text-sm font-medium">{c.name}</p><div><p className="text-xs text-muted-foreground">Presupuesto</p><p className="break-words text-sm">{pesos(c.budget_clp)}</p></div><div><p className="text-xs text-muted-foreground">Asignado</p><p className="break-words text-sm">{pesos(c.allocated_clp)}</p></div><div><p className="text-xs text-muted-foreground">Sin asignar</p><p className="break-words text-sm">{pesos(c.unallocated_clp)}</p></div></div>):<p className="p-3 text-sm text-muted-foreground">No hay centros de costo en la versión aprobada.</p>}</div></details>:null}
       </>:null}
     </div>:null}
   </details>
 </section>;
}
