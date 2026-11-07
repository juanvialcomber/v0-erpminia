'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, CircleDollarSign, FileWarning } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type Item={
 id:string;contract_number:string|null;title:string|null;contractor_name:string|null;contract_value:number;
 contract_paid_amount:number;currency:string;status:string|null;
 supplier:{id:string;name:string|null;rut:string|null}|null;
 laudus:{invoice_count:number;invoiced_amount:number;paid_amount:number;outstanding_amount:number;last_payment_at:string|null;payment_statuses:string[]}|null;
 attribution:{level:'supplier'|'unresolved';exact_contract_payment:boolean;reason:string};
};
type Recon={contract_number:string;purchase_order_number:string;status:'pending'|'verified'|'conflict'|'not_found';reason:string;provenance:{source_file:string;source_sheet:string;source_cell:string;source_text:string}};
type Payload={
 data:Item[];
 summary:{
  contracts:number;contracts_with_supplier:number;contracts_with_laudus_supplier:number;contracts_without_laudus_supplier:number;
  contract_supplier_invoices:number;paid_invoices:number;partial_invoices:number;unpaid_invoices:number;
  supplier_level_paid_amount:number;supplier_level_outstanding_amount:number;
  procurement_health_status:string;procurement_freshness_at:string|null;procurement_conflicts:number;
 };
 policy:{source:string;warning:string};
};
type ReconPayload={data:Recon[];summary:{total:number;verified:number;pending:number;conflicts:number;not_found:number}};
type RequestReadyItem={id:string;contract_number:string;milestone_title:string;invoice_number:string;invoice_amount_source:number;retention_amount_source:number;currency:string;readiness:'ready_for_request'|'needs_due_date'|'needs_payable_promotion'|'settled'|'conflict'|'missing_supplier';reason:string;next_action:string;payable:{id:string;supplier_name:string;approved_amount:number;paid_amount:number;outstanding_amount:number;due_date:string|null;status:string;days_to_due:number|null}|null;provenance:{source_file:string;source_sheet:string;source_row:number;source_text:string}};
type RequestReadyPayload={data:RequestReadyItem[];summary:{invoices:number;ready_for_request:number;needs_due_date:number;needs_payable_promotion:number;conflicts:number;settled:number};policy:{gate:string;authority:string;source:string}};

const fetcher=async<T,>(url:string)=>{const r=await fetch(url,{credentials:'include',cache:'no-store'});const p=await r.json().catch(()=>null);if(!r.ok)throw new Error(p?.error||'No se pudo cargar información financiera');return p as T};
const money=(v:number,currency='CLP')=>new Intl.NumberFormat('es-CL',{style:'currency',currency,maximumFractionDigits:currency==='CLP'?0:2}).format(Number(v||0));
const date=(v:string|null)=>v?new Intl.DateTimeFormat('es-CL',{dateStyle:'medium',timeStyle:'short'}).format(new Date(v)):'—';

export default function LegalPaymentsInvoicesPage(){
 const {data,error,isLoading}=useSWR<Payload>('/api/legal/laudus-bridge',fetcher,{revalidateOnFocus:false});
 const {data:recon}=useSWR<ReconPayload>('/api/legal/contract-po-reconciliation',fetcher,{revalidateOnFocus:false});
 const {data:requestReady}=useSWR<RequestReadyPayload>('/api/legal/payment-request-readiness',fetcher,{revalidateOnFocus:false});
 if(isLoading)return <StatePanel tone="loading" title="Revisando pagos y facturas" description="Conciliando contratos, proveedores, órdenes de compra, facturas y pagos."/>;
 if(error||!data)return <StatePanel tone="error" title="Pagos y facturas no disponibles" description="MOTIL no concluye estados financieros cuando falta evidencia verificable."/>;
 const attention=data.partial_invoices+data.unpaid_invoices+(recon?.summary.conflicts||0)+(recon?.summary.not_found||0);
 return <div className="space-y-5">
  <Button asChild size="sm" variant="ghost"><Link href="/dashboard/legal"><ArrowLeft className="mr-2 h-4 w-4"/>Legal</Link></Button>

  <header className="flex flex-col gap-3 border-b border-border/70 pb-4 md:flex-row md:items-end md:justify-between">
   <div>
    <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Finanzas</p>
    <h1 className="mt-1 text-2xl font-semibold tracking-tight">Pagos y facturas</h1>
    <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Consulta financiera desde MOTIL. La procedencia ERP queda en segundo plano; las decisiones se toman aquí con evidencia.</p>
   </div>
   <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/avances-pagos">Ver contratos <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
  </header>

  <section className="rounded-md border p-4">
   <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
    <div>
     <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Conclusión</p>
     <h2 className="mt-1 text-base font-semibold">{attention>0?`${attention} excepciones requieren revisión`:'Sin excepciones financieras relevantes en los contratos vinculados'}</h2>
     <p className="mt-1 text-sm text-muted-foreground">{data.summary.procurement_health_status==='healthy'?'Información financiera actualizada correctamente.':'La fuente financiera requiere revisión de frescura antes de concluir.'}</p>
    </div>
    <div className="text-xs text-muted-foreground md:text-right">
     <p>Actualizado: {date(data.summary.procurement_freshness_at)}</p>
     <p className="mt-1">{data.summary.procurement_conflicts} conflictos de sincronización</p>
    </div>
   </div>
  </section>

  <section className="grid overflow-hidden rounded-md border sm:grid-cols-4">
   {[
    ['Facturas vinculadas',data.summary.contract_supplier_invoices],
    ['Pagadas',data.summary.paid_invoices],
    ['Parciales',data.summary.partial_invoices],
    ['Impagas',data.summary.unpaid_invoices],
   ].map(([label,value],i)=><div key={String(label)} className={`px-4 py-3 ${i?'border-t sm:border-l sm:border-t-0':''}`}><p className="text-[11px] uppercase text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div>)}
  </section>

  {requestReady ? <section className="overflow-hidden rounded-md border">
   <div className="flex flex-col gap-3 border-b bg-muted/20 px-4 py-3 md:flex-row md:items-start md:justify-between">
    <div>
     <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Siguiente gate</p>
     <h2 className="mt-1 text-base font-semibold">Listo para solicitar pago</h2>
     <p className="mt-1 text-sm text-muted-foreground">MOTIL exige factura exacta, proveedor, moneda, CxP con saldo y vencimiento antes de habilitar el flujo de firmas.</p>
    </div>
    <div className="text-xs text-muted-foreground md:text-right"><p>{requestReady.summary.ready_for_request} listos</p><p>{requestReady.summary.needs_payable_promotion} requieren CxP · {requestReady.summary.needs_due_date} requieren vencimiento</p></div>
   </div>
   <div className="divide-y">
    {requestReady.data.filter((item)=>item.readiness!=='settled').slice(0,10).map((item)=><article key={item.id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
     <div>
      <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.contract_number}</Badge><span className="text-sm font-medium">Factura {item.invoice_number}</span><Badge variant={item.readiness==='ready_for_request'?'secondary':item.readiness==='conflict'||item.readiness==='missing_supplier'?'destructive':'outline'}>{item.readiness==='ready_for_request'?'Lista':item.readiness==='needs_due_date'?'Falta vencimiento':item.readiness==='needs_payable_promotion'?'Falta CxP MOTIL':'Revisar'}</Badge></div>
      <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
      <p className="mt-2 text-sm"><span className="font-medium">Siguiente acción:</span> {item.next_action}</p>
     </div>
     <div className="text-xs text-muted-foreground md:text-right"><p>{money(item.payable?.outstanding_amount??item.invoice_amount_source,item.currency)}</p><p className="mt-1">{item.payable?'Saldo MOTIL':'Monto fuente'}</p><p className="mt-2">{item.provenance.source_sheet} · fila {item.provenance.source_row}</p></div>
    </article>)}
   </div>
   <div className="border-t px-4 py-3 text-xs text-muted-foreground"><p>{requestReady.policy.gate}</p><p className="mt-1">{requestReady.policy.authority}</p></div>
  </section> : null}

  <section className="grid gap-3 md:grid-cols-3">
   <article className="rounded-md border p-4"><CheckCircle2 className="h-4 w-4 text-muted-foreground"/><p className="mt-3 text-sm font-semibold">Pagado</p><p className="mt-1 text-xs text-muted-foreground">{data.summary.paid_invoices} facturas con pago verificado en la fuente financiera.</p></article>
   <article className="rounded-md border p-4"><Clock3 className="h-4 w-4 text-muted-foreground"/><p className="mt-3 text-sm font-semibold">Pago parcial</p><p className="mt-1 text-xs text-muted-foreground">{data.summary.partial_invoices} facturas requieren distinguir saldo ordinario de retención contractual.</p></article>
   <article className="rounded-md border p-4"><FileWarning className="h-4 w-4 text-muted-foreground"/><p className="mt-3 text-sm font-semibold">Sin pago verificado</p><p className="mt-1 text-xs text-muted-foreground">{data.summary.unpaid_invoices} facturas siguen impagas o pendientes según evidencia financiera.</p></article>
  </section>

  <section className="overflow-hidden rounded-md border">
   <div className="border-b bg-muted/20 px-4 py-3"><h2 className="text-sm font-semibold">Contratos y estado financiero</h2><p className="mt-1 text-xs text-muted-foreground">{data.policy.warning}</p></div>
   <div className="divide-y">
    {data.data.map(item=><article key={item.id} className="p-4">
     <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
      <div className="min-w-0">
       <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.contract_number||'Sin número'}</Badge>{item.laudus?<Badge variant="secondary">Proveedor conciliado</Badge>:<Badge variant="outline">Falta conciliación</Badge>}</div>
       <h3 className="mt-2 text-sm font-semibold">{item.title||item.contractor_name||'Contrato'}</h3>
       <p className="mt-1 text-xs text-muted-foreground">{item.supplier?`${item.supplier.name||item.contractor_name||'Proveedor'} · ${item.supplier.rut||'RUT no informado'}`:'Proveedor no enlazado'}</p>
      </div>
      <div className="text-xs text-muted-foreground lg:text-right"><p>Contrato: {money(item.contract_value,item.currency)}</p><p className="mt-1">Pagado contractual: {money(item.contract_paid_amount,item.currency)}</p></div>
     </div>
     <div className="mt-3 grid gap-2 border-t pt-3 text-xs md:grid-cols-4">
      <p><span className="font-medium text-foreground">Facturado proveedor</span><br/>{item.laudus?money(item.laudus.invoiced_amount,item.currency):'—'}</p>
      <p><span className="font-medium text-foreground">Pagado proveedor</span><br/>{item.laudus?money(item.laudus.paid_amount,item.currency):'—'}</p>
      <p><span className="font-medium text-foreground">Pendiente proveedor</span><br/>{item.laudus?money(item.laudus.outstanding_amount,item.currency):'—'}</p>
      <p><span className="font-medium text-foreground">Último pago</span><br/>{item.laudus?.last_payment_at?date(item.laudus.last_payment_at):'—'}</p>
     </div>
     {!item.attribution.exact_contract_payment?<p className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground"><span className="font-medium text-foreground">Precisión:</span> {item.attribution.reason}</p>:null}
    </article>)}
   </div>
  </section>

  {recon?<details className="rounded-md border">
    <summary className="cursor-pointer list-none p-4">
      <div className="flex items-start justify-between gap-3">
        <div><CircleDollarSign className="h-4 w-4 text-muted-foreground"/><h2 className="mt-3 text-sm font-semibold">Conciliación contrato ↔ OC</h2><p className="mt-2 text-xs text-muted-foreground">{recon.summary.verified} verificadas · {recon.summary.pending} pendientes · {recon.summary.conflicts} conflictos · {recon.summary.not_found} no encontradas.</p></div>
        <span className="text-xs text-muted-foreground">Ver detalle</span>
      </div>
    </summary>
    <div className="divide-y border-t">
      {recon.data.slice(0,20).map((item)=><div key={item.contract_number+'-'+item.purchase_order_number} className="grid gap-2 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div>
          <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{item.contract_number}</Badge><span className="text-sm font-medium">OC {item.purchase_order_number}</span><Badge variant={item.status==='verified'?'secondary':item.status==='conflict'?'destructive':'outline'}>{item.status==='verified'?'Verificada':item.status==='conflict'?'Conflicto':item.status==='not_found'?'No encontrada':'Pendiente'}</Badge></div>
          <p className="mt-1 text-xs text-muted-foreground">{item.reason}</p>
        </div>
        <div className="text-xs text-muted-foreground md:text-right"><p>{item.provenance.source_sheet} · {item.provenance.source_cell}</p><p className="mt-1">{item.provenance.source_file}</p></div>
      </div>)}
    </div>
  </details>:null}

  <p className="text-xs text-muted-foreground">{data.policy.source}</p>
 </div>;
}
