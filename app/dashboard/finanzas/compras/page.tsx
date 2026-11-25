'use client';
import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { PurchaseOrderEvidence } from '@/components/finance/purchase-order-evidence';
type Payment={id:string;amount:number;currency:string|null;payment_date:string;reconciled_at:string|null};
type Payable={id:string;currency:string|null;approved_amount:number;paid_amount:number;outstanding_amount:number;status:string;payments:Payment[]};
type Invoice={id:string;invoice_number:string;currency:string|null;total_amount:number;status:string;matching:{match_status:string;line_count:number;matched_line_count:number;pending_receipt_line_count:number;exception_line_count:number}[];payables:Payable[]};
type Order={id:string;order_number:string;status:string;currency:string|null;total_amount:number;issued_at:string;receipts:{id:string;receipt_number:string;received_at:string}[];invoices:Invoice[]};
type Result={rows:Order[];total:number;page:number};
const fmt=(value:number|null,currency:string|null)=>value==null?'Sin dato':Number(value).toLocaleString('es-CL')+' '+(currency??'moneda por confirmar');
const fetcher=async(url:string):Promise<Result>=>{const response=await fetch(url,{credentials:'include',cache:'no-store'});if(!response.ok)throw new Error('No se pudo consultar la trazabilidad.');return response.json();};
export default function FinancePurchasesPage(){
 const [page,setPage]=useState(1);
 const {data,error,isLoading,mutate}=useSWR('/api/finance/purchase-trace?page='+page,fetcher,{revalidateOnFocus:false});
 return <main className="space-y-5">
 <header className="space-y-2"><p className="text-xs text-muted-foreground">Administración y Finanzas</p><h1 className="text-2xl font-semibold">Compras</h1><p className="text-sm text-muted-foreground">Seguimiento financiero desde la orden hasta el pago. Las recepciones son evidencia de Bodega, no una autorización de pago.</p><div className="flex flex-wrap gap-4 text-sm underline"><Link href="/dashboard/finanzas">Volver a Finanzas</Link><Link href="/dashboard/finanzas/conciliacion">Conciliación de facturas</Link><Link href="/dashboard/compras">Operación de Compras</Link></div></header>
 <section className="space-y-3"><h2 className="font-semibold">Trazabilidad de órdenes operativas</h2>
 {error?<div role="alert" className="space-y-2"><p>No se pudo verificar la cadena de documentos.</p><Button variant="outline" onClick={()=>void mutate()}>Reintentar</Button></div>:isLoading||!data?<p role="status">Consultando órdenes…</p>:<>
 <p className="text-xs text-muted-foreground">{data.total.toLocaleString('es-CL')} órdenes operativas; no incluye automáticamente las órdenes históricas de Laudus.</p>
 {data.rows.length===0?<p className="text-sm text-muted-foreground">No hay órdenes en esta página.</p>:data.rows.map(order=><details key={order.id} className="rounded-lg border bg-card"><summary className="cursor-pointer p-4"><span className="font-medium">OC {order.order_number}</span><span className="block text-xs text-muted-foreground">{fmt(order.total_amount,order.currency)} · {order.receipts.length} recepciones · {order.invoices.length} facturas</span></summary><div className="border-t p-4 space-y-4 text-sm">
 <section><h3 className="font-medium">Recepciones de Bodega</h3>{order.receipts.length?order.receipts.map(r=><p key={r.id}>{r.receipt_number} · {r.received_at.slice(0,10)}</p>):<p className="text-muted-foreground">Sin recepción vinculada.</p>}</section>
 <section className="space-y-2"><h3 className="font-medium">Facturas y pagos</h3>{order.invoices.length?order.invoices.map(i=><div key={i.id} className="rounded-md border p-3 space-y-2"><p className="font-medium">Factura {i.invoice_number} · {fmt(i.total_amount,i.currency)}</p>{i.matching.length?i.matching.map((m,index)=><p key={index} className="text-xs">Líneas coincidentes: {m.matched_line_count}/{m.line_count} · pendientes de recepción: {m.pending_receipt_line_count} · excepciones: {m.exception_line_count}</p>):<p className="text-xs text-muted-foreground">Sin comparación de líneas disponible.</p>}{i.payables.length?i.payables.map(p=><div key={p.id} className="border-t pt-2"><p>Obligación: {fmt(p.approved_amount,p.currency)} · saldo: {fmt(p.outstanding_amount,p.currency)}</p>{p.payments.length?p.payments.map(x=><p key={x.id} className="text-xs">{x.payment_date} · {fmt(x.amount,x.currency)} · {x.reconciled_at?'Conciliación registrada':'Sin conciliación bancaria registrada'}</p>):<p className="text-xs text-muted-foreground">Sin pagos vinculados.</p>}</div>):<p className="text-xs text-muted-foreground">Sin obligación vinculada.</p>}</div>):<p className="text-muted-foreground">Sin facturas vinculadas. No permite concluir que no existan facturas en Laudus.</p>}</section></div></details>)}
 <div className="flex items-center justify-between"><Button variant="outline" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs">Página {page}</span><Button variant="outline" disabled={page*20>=data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div></>}
 </section><PurchaseOrderEvidence /></main>;
}
