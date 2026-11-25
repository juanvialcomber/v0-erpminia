'use client';

import { useState } from 'react';
import useSWR from 'swr';
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
type Result = { summary: Partial<Record<Status,number>>; total: number; rows: Row[] };
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
