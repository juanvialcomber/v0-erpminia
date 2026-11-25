'use client';
import { useState } from 'react';
import useSWR from 'swr';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

const labels: Record<string,string> = {
  missing_lines:'Sin detalle',line_conflict:'Diferencia en líneas',currency_missing:'Moneda por confirmar',
  supplier_identity_missing:'Proveedor por confirmar',header_total_missing:'Total documental pendiente',
  unlinked:'Sin conciliación',review_required:'Revisión requerida',
};
type Row = {external_id:string;order_number:string|null;supplier_name:string|null;issued_date:string|null;due_date:string|null;currency:string|null;reconstructed_line_amount:number|null;line_count:number;zero_lines:number;has_supplier_rut:boolean;has_canonical_link:boolean;evidence_status:string;synced_at:string|null};
type Payload = {summary:Record<string,number>;coverage:{orders:number;orders_with_lines:number;lines:number;missing_currency:number;linked_orders:number};total:number;rows:Row[]};
const fetcher = async (url:string):Promise<Payload> => {
  const response=await fetch(url,{credentials:'include',cache:'no-store'});
  if(!response.ok)throw new Error('No se pudo consultar compras');
  return response.json();
};
const integer=(value:number)=>new Intl.NumberFormat('es-CL').format(value);
function amount(row:Row) {
  if(row.reconstructed_line_amount == null || row.evidence_status==='line_conflict' || row.evidence_status==='missing_lines')return '—';
  const value=Number(row.reconstructed_line_amount);
  if(!Number.isFinite(value))return '—';
  if(row.currency && !/^[A-Z]{3}$/.test(row.currency))return 'Moneda no verificable';
  if(!row.currency)return value.toLocaleString('es-CL')+' · moneda por confirmar';
  const currency=row.currency;
  try{return new Intl.NumberFormat('es-CL',{style:'currency',currency,maximumFractionDigits:currency==='CLP'?0:2}).format(value);}
  catch{return 'Moneda no verificable';}
}
export function PurchaseOrderEvidence(){
  const [open,setOpen]=useState(false);
  const [status,setStatus]=useState('');
  const [page,setPage]=useState(1);
  const {data,error,isLoading,mutate}=useSWR<Payload>(open?`/api/finance/purchase-order-evidence?page=${page}&status=${encodeURIComponent(status)}`:null,fetcher);
  return <section className="rounded-lg border bg-card" aria-label="Revisión de órdenes de compra">
    <details onToggle={event=>setOpen(event.currentTarget.open)}>
      <summary className="cursor-pointer px-4 py-3"><span className="font-medium">Revisar órdenes de compra Laudus</span><span className="block text-xs text-muted-foreground">Importes reconstruidos, moneda y evidencia pendiente</span></summary>
      <div className="space-y-4 border-t p-4">
        <p className="text-sm text-muted-foreground">Importes nominales de líneas, no compromisos abiertos ni deudas. No se presume CLP cuando la fuente no informa moneda; no incluye validación de impuestos o descuentos.</p>
        {isLoading?<p role="status">Consultando evidencia…</p>:error?<div role="status"><p>No se pudo verificar la evidencia. No significa que no existan órdenes.</p><Button size="sm" variant="outline" onClick={()=>void mutate()}>Reintentar</Button></div>:data?<><div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {([['Órdenes',data.coverage.orders],['Con detalle',data.coverage.orders_with_lines],['Líneas',data.coverage.lines],['Moneda pendiente',data.coverage.missing_currency]] as const).map(([label,value])=><div key={label}><p className="text-xs text-muted-foreground">{label}</p><p className="text-lg font-semibold tabular-nums">{integer(value)}</p></div>)}
        </div><label className="block text-sm">Clasificación<select className="ml-2 max-w-full rounded-md border bg-background p-2" value={status} onChange={event=>{setStatus(event.target.value);setPage(1);}}><option value="">Todas</option>{Object.entries(labels).map(([key,label])=><option key={key} value={key}>{label} ({integer(data.summary[key]??0)})</option>)}</select></label>
        {data.rows.length===0?<p>No hay órdenes en esta clasificación.</p>:<div className="divide-y rounded-md border">{data.rows.map(row=><div key={row.external_id} className="grid gap-2 p-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]"><div className="min-w-0"><p className="font-medium break-words">OC {row.order_number||row.external_id} · {row.supplier_name||'Proveedor pendiente'}</p><p className="text-xs text-muted-foreground">{row.issued_date?.slice(0,10)||'Fecha pendiente'} · {integer(row.line_count)} líneas</p><Badge variant="outline">{labels[row.evidence_status]||'Revisión requerida'}</Badge></div><div className="sm:text-right"><p className="font-semibold tabular-nums">{amount(row)}</p><p className="text-xs text-muted-foreground">{row.currency?'Moneda informada por fuente':'Moneda no documentada'}</p>{!row.has_supplier_rut?<p className="text-xs">RUT pendiente</p>:null}{row.zero_lines>0?<p className="text-xs">{row.zero_lines} líneas sin importe positivo</p>:null}<p className="text-xs text-muted-foreground">Revisar documento original antes de adoptar.</p></div></div>)}</div>}
        <div className="flex flex-wrap items-center justify-between gap-2"><Button variant="outline" size="sm" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs">Página {page} de {Math.max(1,Math.ceil(data.total/50))}</span><Button variant="outline" size="sm" disabled={page*50>=data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
        </>:null}
      </div>
    </details>
  </section>;
}
