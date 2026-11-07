'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, CheckCircle2, Clock3, Mail, MessageCircle, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

type Invoice = { doc_number:string; source_net_amount:number; source_retention_amount:number; payment_state:string; laudus:{outstanding_amount:number}|null };
type Milestone = { contract_number:string; contractor_name:string|null; sequence:number; title:string; purchase_order_number:string; currency:string; total_amount:number; progress_ratio:number; executed_amount:number; invoiced_amount:number; pending_to_invoice:number; payment_state:string; invoices:Invoice[]; provenance:{source_sheet:string;source_row:number} };
type ContractSummary = { contract_number:string; title:string|null; contractor_name:string|null; contract_value:number; contract_currency:string; contract_paid_amount:number; milestones:number; milestones_started:number; milestones_paid:number; milestones_retained:number; invoice_matches:number; invoice_expected:number; detail_available:boolean; source_start_date:string|null; source_end_date:string|null; source_schedule_note:string|null; source_progress_ratio:number|null; days_to_end:number|null; budget_overrun:boolean; attention_state:'green'|'yellow'|'red'|'neutral'; attention_reasons:string[] };
type Payload = { data:Milestone[]; contracts:ContractSummary[]; summary:{contracts:number;milestones:number;invoices_expected:number;invoices_matched:number;retained_milestones:number;contracts_red:number;contracts_yellow:number;contracts_green:number}; policy:{retention:string;no_inference:string;schedule:string} };
type EvidenceItem = { source:'email'|'whatsapp';source_id:string;occurred_at:string|null;sender:string|null;context:string|null;file_name:string|null;mime_type:string|null;sha256:string|null;ingest_state:string;download_state:string;source_cutoff_date:string|null;contracts:string[];purchase_orders:string[];needs_review:boolean };
type EvidencePayload = { data:EvidenceItem[];summary:{total:number;email:number;whatsapp:number;with_contract_reference:number;with_purchase_order_reference:number};policy:{promotion:string;matching:string} };

const fetcher = async (url:string) => {
  const response = await fetch(url,{credentials:'include',cache:'no-store'});
  const payload = await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error || 'No se pudo cargar avances y pagos');
  return payload as Payload;
};
const evidenceFetcher = async (url:string) => {
  const response = await fetch(url,{credentials:'include',cache:'no-store'});
  const payload = await response.json().catch(()=>null);
  if(!response.ok) throw new Error(payload?.error || 'No se pudo cargar evidencia entrante');
  return payload as EvidencePayload;
};

function money(value:number,currency='CLP'){ if(currency==='UF') return `${new Intl.NumberFormat('es-CL',{maximumFractionDigits:3}).format(value||0)} UF`; return new Intl.NumberFormat('es-CL',{style:'currency',currency,maximumFractionDigits:currency==='CLP'?0:2}).format(value||0); }
function percent(value:number){ return new Intl.NumberFormat('es-CL',{style:'percent',maximumFractionDigits:1}).format(value||0); }
function label(state:string){
  if(state==='paid') return 'Pagado';
  if(state==='paid_with_retention') return 'Pagado · retención pendiente';
  if(state==='partial') return 'Pago parcial';
  if(state==='unpaid') return 'Factura pendiente';
  if(state==='not_invoiced') return 'Sin facturar';
  return 'Revisar conciliación';
}
function attentionBadge(state:ContractSummary['attention_state']){
  if(state==='green') return <Badge className="border-emerald-600/30 bg-emerald-500/10 text-emerald-700 hover:bg-emerald-500/10 dark:text-emerald-300">100% verificado</Badge>;
  if(state==='yellow') return <Badge className="border-amber-600/30 bg-amber-500/10 text-amber-700 hover:bg-amber-500/10 dark:text-amber-300">≤15 días</Badge>;
  if(state==='red') return <Badge variant="destructive">Revisar</Badge>;
  return <Badge variant="outline">Sin señal de fecha</Badge>;
}
function variant(state:string):'default'|'secondary'|'destructive'|'outline'{
  if(state==='paid') return 'secondary';
  if(state==='unpaid'||state==='partial'||state==='needs_reconciliation') return 'destructive';
  return 'outline';
}
function decision(item:Milestone){
  if(item.payment_state==='needs_reconciliation') return {
    conclusion:'Hay facturas informadas que no están conciliadas exactamente con Laudus.',
    next:'Revisar proveedor + número de factura antes de concluir pago.',
    tone:'destructive' as const,
  };
  if(item.payment_state==='partial') return {
    conclusion:'Existe pago parcial que no queda explicado completamente por retención.',
    next:'Conciliar saldo pendiente y retención con Finanzas.',
    tone:'destructive' as const,
  };
  if(item.payment_state==='unpaid') return {
    conclusion:'La factura está identificada, pero el pago sigue pendiente.',
    next:'Confirmar con Finanzas si existe transferencia ejecutada o programada.',
    tone:'destructive' as const,
  };
  if(item.payment_state==='paid_with_retention') return {
    conclusion:'El pago está conciliado y el saldo pendiente coincide con retención contractual.',
    next:'Mantener la retención separada de deuda ordinaria y controlar su liberación.',
    tone:'outline' as const,
  };
  if(item.payment_state==='paid') return {
    conclusion:'Las facturas informadas para este hito aparecen pagadas en la evidencia financiera disponible.',
    next:item.progress_ratio>=0.999?'Revisar cierre contractual del hito.':'Continuar seguimiento del avance físico.',
    tone:'secondary' as const,
  };
  if(item.progress_ratio>0 && item.invoiced_amount<=0) return {
    conclusion:'Existe avance físico sin facturación informada.',
    next:'Revisar si corresponde preparar estado de pago o factura.',
    tone:'destructive' as const,
  };
  if(item.payment_state==='not_invoiced') return {
    conclusion:item.progress_ratio>0?'Hay avance físico y aún no existe factura informada.':'Hito sin avance ni facturación informada.',
    next:item.progress_ratio>0?'Validar con el responsable si corresponde facturar el avance.':'Mantener seguimiento hasta que exista avance verificable.',
    tone:'outline' as const,
  };
  return {
    conclusion:'El estado requiere revisión antes de concluir.',
    next:'Revisar evidencia contractual y financiera.',
    tone:'outline' as const,
  };
}

export default function ContractPaymentsPage(){
  const {data,error,isLoading}=useSWR<Payload>('/api/legal/contract-payment-control',fetcher,{revalidateOnFocus:false});
  const {data:evidence,error:evidenceError}=useSWR<EvidencePayload>('/api/legal/contract-evidence-queue',evidenceFetcher,{revalidateOnFocus:false});
  if(isLoading) return <StatePanel tone="loading" title="Conciliando avances y pagos" description="Leyendo avance contractual y evidencia financiera Laudus."/>;
  if(error||!data) return <StatePanel tone="error" title="Avances no disponibles" description="MOTIL no muestra estados de pago si no puede verificar la evidencia."/>;
  return <div className="space-y-5">
    <div className="flex flex-wrap items-center justify-between gap-3">
      <Button asChild size="sm" variant="ghost"><Link href="/dashboard/legal"><ArrowLeft className="mr-2 h-4 w-4"/>Legal</Link></Button>
      <Button asChild size="sm" variant="outline"><Link href="/dashboard/legal/laudus">Evidencia financiera <ArrowRight className="ml-2 h-4 w-4"/></Link></Button>
    </div>
    <header className="border-b border-border/70 pb-4">
      <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Legal · Contratos</p>
      <h1 className="mt-1 text-2xl font-semibold tracking-tight">Avances y pagos</h1>
      <p className="mt-1 max-w-3xl text-sm text-muted-foreground">Primero muestra qué significa cada estado y qué debe hacer Legal. Avance físico, facturación, retención y pago se mantienen separados.</p>
      <p className="mt-2 text-xs text-muted-foreground">Cobertura contractual: IO-01…IO-09 y EP-01…EP-06. Detalle estructurado disponible en IO-01…IO-09, EP-02 y EP-03. EP-01, EP-04, EP-05 y EP-06 permanecen en resumen hasta contar con evidencia de hitos/facturas.</p>
    </header>
    <section className="grid overflow-hidden rounded-md border sm:grid-cols-4">
      <div className="px-4 py-3"><p className="text-[11px] uppercase text-muted-foreground">Contratos revisados</p><p className="mt-1 text-xl font-semibold">{data.summary.contracts}</p></div>
      <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">Revisión roja</p><p className="mt-1 text-xl font-semibold">{data.summary.contracts_red}</p></div>
      <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">≤15 días</p><p className="mt-1 text-xl font-semibold">{data.summary.contracts_yellow}</p></div>
      <div className="border-t px-4 py-3 sm:border-l sm:border-t-0"><p className="text-[11px] uppercase text-muted-foreground">100% verificado</p><p className="mt-1 text-xl font-semibold">{data.summary.contracts_green}</p></div>
    </section>
    <section className="overflow-hidden rounded-md border">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b bg-muted/20 px-4 py-3">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">Evidencia entrante</p>
          <h2 className="mt-1 text-base font-semibold">Correo + WhatsApp</h2>
          <p className="mt-1 text-sm text-muted-foreground">Nuevas fuentes quedan en revisión. MOTIL sólo identifica referencias explícitas de contrato u OC; no modifica avances automáticamente.</p>
        </div>
        {evidence ? <div className="text-right text-xs text-muted-foreground"><p>{evidence.summary.total} fuentes</p><p>{evidence.summary.with_contract_reference} con contrato · {evidence.summary.with_purchase_order_reference} con OC</p></div> : null}
      </div>
      {evidenceError ? <p className="px-4 py-3 text-sm text-destructive">No se pudo actualizar la cola de evidencia.</p> : null}
      {evidence?.data?.length ? <div className="divide-y">{evidence.data.slice(0,8).map((item)=><div key={item.source_id} className="grid gap-3 px-4 py-3 md:grid-cols-[minmax(0,1fr)_auto]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            {item.source==='email'?<Mail className="h-4 w-4 text-muted-foreground"/>:<MessageCircle className="h-4 w-4 text-muted-foreground"/>}
            <Badge variant="outline">{item.source==='email'?'Correo':'WhatsApp'}</Badge>
            {item.contracts.map((ref)=><Badge key={ref} variant="secondary">{ref}</Badge>)}
            {item.purchase_orders.slice(0,4).map((ref)=><Badge key={ref} variant="outline">OC {ref}</Badge>)}
            {!item.contracts.length&&!item.purchase_orders.length?<Badge variant="outline">Sin match explícito</Badge>:null}
          </div>
          <p className="mt-2 truncate text-sm font-medium">{item.file_name || item.context || 'Mensaje sin archivo'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{[item.sender,item.context].filter(Boolean).join(' · ')}</p>
        </div>
        <div className="text-xs text-muted-foreground md:text-right">
          <p>{item.occurred_at ? new Date(item.occurred_at).toLocaleString('es-CL') : 'Fecha no disponible'}</p>
          <p className="mt-1">{item.ingest_state} · {item.download_state}</p>
          {item.sha256?<p className="mt-1 font-mono">{item.sha256.slice(0,10)}…</p>:null}
        </div>
      </div>)}</div> : !evidenceError ? <p className="px-4 py-3 text-sm text-muted-foreground">No hay evidencia contractual nueva en las fuentes habilitadas.</p> : null}
      {evidence ? <div className="border-t px-4 py-3 text-xs text-muted-foreground"><p>{evidence.policy.promotion}</p><p className="mt-1">{evidence.policy.matching}</p></div> : null}
    </section>

    <section className="grid gap-3 lg:grid-cols-2">
      {data.contracts.map((contract)=><article key={contract.contract_number} className="rounded-md border p-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{contract.contract_number}</Badge>{attentionBadge(contract.attention_state)}</div>
            <h2 className="mt-2 text-sm font-semibold">{contract.title || contract.contractor_name}</h2>
            {contract.source_end_date ? <p className="mt-1 text-xs text-muted-foreground">Término fuente: {contract.source_end_date}{contract.days_to_end!==null ? contract.days_to_end < 0 ? ` · venció hace ${Math.abs(contract.days_to_end)} días` : ` · faltan ${contract.days_to_end} días` : ''}</p> : <p className="mt-1 text-xs text-muted-foreground">Fecha de término no informada/utilizable en la fuente.</p>}
          </div>
          <div className="text-right text-xs text-muted-foreground"><p>{money(contract.contract_value,contract.contract_currency)}</p><p className="mt-1">Pagado resumen: {money(contract.contract_paid_amount,contract.contract_currency)}</p></div>
        </div>
        {contract.attention_reasons.length ? <div className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs">{contract.attention_reasons.map((reason)=><p key={reason}>{reason}</p>)}</div> : null}
        {contract.detail_available ? <div className="mt-4 grid grid-cols-4 gap-2 text-xs"><div><span className="text-muted-foreground">Avance</span><p className="mt-1 font-semibold">{contract.source_progress_ratio===null?'—':percent(contract.source_progress_ratio)}</p></div><div><span className="text-muted-foreground">Iniciados</span><p className="mt-1 font-semibold">{contract.milestones_started}/{contract.milestones}</p></div><div><span className="text-muted-foreground">Pagados</span><p className="mt-1 font-semibold">{contract.milestones_paid}</p></div><div><span className="text-muted-foreground">Retención</span><p className="mt-1 font-semibold">{contract.milestones_retained}</p></div></div> : <p className="mt-4 text-xs text-muted-foreground">Resumen contractual cargado. Detalle de hitos/facturas aún no estructurado.</p>}
      </article>)}
    </section>
    <section className="space-y-3">
      {data.contracts.filter((contract)=>contract.detail_available).map((contract)=><article key={'detail-'+contract.contract_number} className="overflow-hidden rounded-md border">
        <div className="border-b bg-muted/20 px-4 py-3"><p className="text-sm font-semibold">{contract.contract_number} · {contract.contractor_name}</p><p className="mt-1 text-xs text-muted-foreground">{contract.invoice_matches}/{contract.invoice_expected} facturas verificadas</p></div>
        <div className="divide-y">
          {data.data.filter((item)=>item.contract_number===contract.contract_number).map((item)=>{
            const guidance=decision(item);
            return <div key={item.contract_number+'-'+item.sequence} className="p-4">
            <div className="mb-3 grid gap-2 rounded-md border bg-muted/20 p-3 md:grid-cols-2">
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Conclusión</p><p className="mt-1 text-sm font-medium">{guidance.conclusion}</p></div>
              <div><p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">Siguiente acción</p><p className="mt-1 text-sm">{guidance.next}</p></div>
            </div>
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">Hito {item.sequence}</Badge><Badge variant="outline">OC {item.purchase_order_number}</Badge><Badge variant={variant(item.payment_state)}>{label(item.payment_state)}</Badge></div><h3 className="mt-2 text-sm font-semibold">{item.title}</h3><p className="mt-1 text-xs text-muted-foreground">Avance {percent(item.progress_ratio)} · Ejecutado {money(item.executed_amount,item.currency)} · Facturado {money(item.invoiced_amount,item.currency)}</p></div><div className="text-xs lg:text-right"><p className="font-medium">{money(item.total_amount,item.currency)}</p><p className="mt-1 text-muted-foreground">Pendiente de facturar {money(item.pending_to_invoice,item.currency)}</p></div></div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-muted"><div className="h-full bg-foreground" style={{width:String(Math.max(0,Math.min(100,item.progress_ratio*100)))+'%'}}/></div>
            {item.invoices.length ? <div className="mt-3 grid gap-2">{item.invoices.map((invoice)=><div key={invoice.doc_number} className="grid gap-2 rounded-md border px-3 py-2 text-xs md:grid-cols-[90px_1fr_1fr_1fr]"><div className="font-medium">F-{invoice.doc_number}</div><div><span className="text-muted-foreground">Neto planilla</span><p>{money(invoice.source_net_amount,item.currency)}</p></div><div><span className="text-muted-foreground">Retención</span><p>{money(invoice.source_retention_amount,item.currency)}</p></div><div><span className="text-muted-foreground">Pago verificado</span><p className="flex items-center gap-1.5">{invoice.payment_state==='paid'?<CheckCircle2 className="h-3.5 w-3.5"/>:<Clock3 className="h-3.5 w-3.5"/>}{label(invoice.payment_state)}</p>{invoice.laudus?<p className="mt-1 text-muted-foreground">Saldo {money(invoice.laudus.outstanding_amount)}</p>:null}</div></div>)}</div> : <p className="mt-3 rounded-md bg-muted/30 px-3 py-2 text-xs text-muted-foreground">Todavía no hay factura informada para este hito.</p>}
            <p className="mt-3 text-[11px] text-muted-foreground">Fuente: {item.provenance.source_sheet} · fila {item.provenance.source_row}</p>
          </div>})}
        </div>
      </article>)}
    </section>
    <section className="rounded-md border p-4"><ShieldCheck className="h-4 w-4 text-muted-foreground"/><h2 className="mt-3 text-sm font-semibold">Regla de verdad</h2><p className="mt-2 text-xs text-muted-foreground">{data.policy.no_inference}</p><p className="mt-2 text-xs text-muted-foreground">{data.policy.retention}</p><p className="mt-2 text-xs text-muted-foreground">{data.policy.schedule}</p></section>
  </div>;
}