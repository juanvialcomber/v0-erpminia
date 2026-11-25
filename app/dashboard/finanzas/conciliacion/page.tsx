'use client';

import { useState } from 'react';
import useSWR, { useSWRConfig } from 'swr';
import { LaudusFinanceReconciliationQueue } from '@/components/integrations/laudus-finance-reconciliation-queue';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { FinanceReconciliationHistory } from '@/components/integrations/finance-reconciliation-history';

const labels = {
  invoice_difference: 'Diferencia de factura',
  payment_difference: 'Diferencia de pagos o saldo',
  ambiguous: 'Identidad ambigua',
  approval_missing: 'Sin obligación aprobada',
  identity_missing: 'Falta RUT o folio válido',
  currency_missing: 'Moneda no identificada',
  laudus_only: 'Sólo en Laudus',
  motil_only: 'Sólo en MOTIL',
  candidate_consistent: 'Coincidencia candidata',
} as const;
type Status = keyof typeof labels;
type Row = {
  laudus_id: string | null; motil_invoice_id: string | null; payable_id: string | null;
  folio: string | null; rut: string | null; supplier_name: string | null;
  laudus_currency: string | null; motil_currency: string | null;
  laudus_total: number | null; motil_total: number | null;
  laudus_paid: number | null; motil_paid: number | null;
  laudus_balance: number | null; motil_balance: number | null;
  laudus_due_date: string | null; motil_due_date: string | null;
  laudus_synced_at: string | null; status: Status;
};
type Result = { summary: Partial<Record<Status,number>>; total: number; rows: Row[]; reviewPlan?: { groups: {status:Status;count:number;action:string}[]; coverage:{laudusOnly:number;motilOnly:number};candidates:number } };
const reviewUrl = '/api/integrations/laudus/finance-reconciliation-review';
const fmt = (amount: number | null, currency: string | null) => {
  if (amount == null || !Number.isFinite(Number(amount))) return 'Sin dato';
  if (!currency) return Number(amount).toLocaleString('es-CL') + ' · moneda desconocida';
  try { return new Intl.NumberFormat('es-CL',{style:'currency',currency}).format(Number(amount)); }
  catch { return Number(amount).toLocaleString('es-CL') + ' ' + currency; }
};
const fetcher = async (url: string): Promise<Result> => {
  const response = await fetch(url,{credentials:'include',cache:'no-store'});
  if (!response.ok) throw new Error('No fue posible consultar la comparación.');
  return response.json();
};
export default function InvoiceReconciliationPage() {
  const [status,setStatus] = useState('');
  const [page,setPage] = useState(1);
  const {data,error,isLoading,mutate} = useSWR('/api/finance/invoice-reconciliation?page='+page+'&status='+encodeURIComponent(status),fetcher,{revalidateOnFocus:false});
  const { mutate: refreshShared } = useSWRConfig();
  const {data:reviewAccess} = useSWR<{canDecide:boolean;projectLead?:{currentUser:boolean}}>(reviewUrl, async url => {
    const response = await fetch(url,{credentials:'include',cache:'no-store'});
    if (!response.ok) throw new Error('Sin acceso a revisiones');
    return response.json();
  },{revalidateOnFocus:false,shouldRetryOnError:false});
  const [registering,setRegistering] = useState<Status|null>(null);
  const [receipt,setReceipt] = useState('');
  const [registrationError,setRegistrationError] = useState('');
  async function registerGroup(group:Status){
    if(registering || !reviewAccess?.canDecide || reviewAccess.projectLead?.currentUser)return;
    setRegistering(group);setReceipt('');setRegistrationError('');
    try{
      const response=await fetch(reviewUrl,{method:'POST',credentials:'include',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'register_invoice_group',group})});
      const result=await response.json().catch(()=>null);
      if(!response.ok)throw new Error(result?.error??'No se pudo registrar la revisión.');
      if(!result || !Number.isInteger(result.created) || !Number.isInteger(result.existing) || !Number.isInteger(result.verified))throw new Error('No se recibió confirmación del registro. Actualiza antes de reintentar.');
      setReceipt(labels[group]+': '+result.created+' casos nuevos, '+result.existing+' ya registrados, '+result.verified+' verificados.');
      await refreshShared(key=>typeof key==='string'&&(key===reviewUrl||key.startsWith(reviewUrl+'?')));
      await mutate();
    }catch(error){setRegistrationError(error instanceof Error?error.message:'No se pudo registrar la revisión.');}
    finally{setRegistering(null);}
  }
  const total = data?.total ?? 0;
  const pageCount = Math.max(1,Math.ceil(total/50));
  return <main className="space-y-5">
    <div className="space-y-2">
      <p className="text-sm text-muted-foreground">Finanzas / Pagos</p>
      <h1 className="text-2xl font-semibold">Conciliación de facturas</h1>
      <p className="text-sm text-muted-foreground">Compara folio, RUT, moneda, montos y pagos registrados. Una coincidencia no autoriza un pago ni confirma el tipo de documento.</p>
      <Link href="/dashboard/finanzas/pagos" className="text-sm underline">Volver a pagos</Link>
    </div>
    <section className="rounded-lg border p-4 space-y-3">
      <h2 className="font-medium">Estado de la comparación</h2>
      <p className="text-xs text-muted-foreground">Los registros sin contraparte son información de cobertura, no tareas de pago. No se suman monedas distintas.</p>
      {isLoading ? <p className="text-sm">Consultando facturas…</p> : error ? <div className="space-y-2"><p className="text-sm">No se pudo consultar la comparación.</p><Button variant="outline" onClick={()=>mutate()}>Reintentar</Button></div> : data ? <>
        <div className="flex flex-wrap gap-2">
          {Object.entries(labels).filter(([key])=>(data.summary[key as Status]??0)>0).map(([key,label])=>
            <Button key={key} variant={status===key?'default':'outline'} size="sm" onClick={()=>{setStatus(key);setPage(1);}}>{label} · {data.summary[key as Status]}</Button>)}
          <Button variant={status===''?'default':'outline'} size="sm" onClick={()=>{setStatus('');setPage(1);}}>Todas</Button>
        </div>
        <p className="text-xs text-muted-foreground">{total.toLocaleString('es-CL')} registros en esta selección</p>
      </> : null}
    </section>
    {!error && data?.reviewPlan ? <section className="rounded-lg border bg-card p-4 space-y-3">
      <h2 className="font-semibold">Diferencias por revisar</h2>
      <p className="text-xs text-muted-foreground">Registra sólo los grupos que necesitan revisión. Los casos anteriores conservan su decisión; no se modifican facturas ni pagos.</p>
      {data.reviewPlan.groups.length ? <div className="divide-y rounded-md border">{data.reviewPlan.groups.map(group=><div key={group.status} className="flex flex-wrap items-center justify-between gap-3 p-3">
        <div className="min-w-0"><h3 className="text-sm font-medium">{labels[group.status]} · {group.count}</h3><p className="text-xs text-muted-foreground">{group.action}</p></div>
        <div className="flex flex-wrap gap-2"><Button variant="outline" size="sm" onClick={()=>{setStatus(group.status);setPage(1);}}>Ver facturas</Button>
        {reviewAccess?.canDecide && !reviewAccess.projectLead?.currentUser ? <Button size="sm" disabled={registering!==null||group.count>100} onClick={()=>void registerGroup(group.status)}>{registering===group.status?'Registrando…':'Registrar revisión'}</Button>:null}</div>
        {group.count>100?<p className="w-full text-xs text-muted-foreground">Grupo superior a 100 registros: requiere procesamiento por lotes.</p>:null}
      </div>)}</div>:<p className="text-sm text-muted-foreground">Sin diferencias clasificadas para revisión.</p>}
      <p className="text-xs text-muted-foreground">Cobertura: {data.reviewPlan.coverage.laudusOnly} sólo Laudus · {data.reviewPlan.coverage.motilOnly} sólo MOTIL. Coincidencias candidatas: {data.reviewPlan.candidates}.</p>
      {receipt?<p role="status" className="text-sm">{receipt}</p>:null}
      {registrationError?<p role="alert" className="text-sm text-destructive">{registrationError}</p>:null}
    </section>:null}
    <LaudusFinanceReconciliationQueue />
    <FinanceReconciliationHistory />
    {!error && data ? <section className="space-y-3">
      {data.rows.length===0 ? <p className="rounded-lg border p-4 text-sm text-muted-foreground">No hay registros en esta selección.</p> : data.rows.map((row,index)=><details key={(row.laudus_id??'')+':'+(row.motil_invoice_id??'')+':'+index} className="rounded-lg border bg-card">
        <summary className="cursor-pointer p-4 text-sm">
          <span className="font-medium">{row.supplier_name??'Proveedor sin identificar'} · Factura {row.folio??'sin folio'}</span>
          <span className="block mt-1 text-xs text-muted-foreground">{labels[row.status]} · {row.laudus_id ? fmt(row.laudus_balance,row.laudus_currency) : fmt(row.motil_balance,row.motil_currency)}</span>
        </summary>
        <div className="border-t p-4 grid gap-4 sm:grid-cols-2 text-sm">
          <div><h3 className="font-medium">Laudus</h3><p>Factura: {fmt(row.laudus_total,row.laudus_currency)}</p><p>Pagos: {fmt(row.laudus_paid,row.laudus_currency)}</p><p>Saldo: {fmt(row.laudus_balance,row.laudus_currency)}</p><p>Vencimiento: {row.laudus_due_date??'Sin fecha'}</p><p className="text-xs text-muted-foreground">Última lectura: {row.laudus_synced_at ? new Date(row.laudus_synced_at).toLocaleString('es-CL',{timeZone:'America/Santiago'}) : 'Sin fecha'}</p></div>
          <div><h3 className="font-medium">MOTIL</h3><p>Factura: {fmt(row.motil_total,row.motil_currency)}</p><p>Pagos: {fmt(row.motil_paid,row.motil_currency)}</p><p>Saldo: {fmt(row.motil_balance,row.motil_currency)}</p><p>Vencimiento: {row.motil_due_date??'Sin fecha'}</p><p>{row.payable_id?'Obligación registrada':'Sin obligación aprobada vinculada'}</p></div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">RUT comparado: {row.rut??'Sin dato'}. Antes de adoptar la coincidencia, verifica el documento original y su tipo. No se modifica ninguna de las fuentes.</p>
        </div>
      </details>)}
      <div className="flex items-center justify-between gap-2"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-xs">Página {page} de {pageCount}</span><Button variant="outline" disabled={page>=pageCount} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>
    </section> : null}
  </main>;
}
