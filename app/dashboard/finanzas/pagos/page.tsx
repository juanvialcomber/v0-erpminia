'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, Clock3, Landmark, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('No se pudieron cargar las facturas pendientes de pago. Inténtalo de nuevo.');
  return payload;
};

const money = (value: unknown, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString('es-CL')}`;
  }
};
const dateLabel = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value))
  : 'Sin fecha';
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

type Payable = { id:string; invoice_number:string; supplier_name:string; approved_amount:number; paid_amount:number; outstanding_amount:number; due_date?:string|null; days_to_due?:number|null; status:string; currency:string };
type Payment = { id:string; payable_id:string; amount:number; currency:string; payment_date:string; payment_reference?:string|null; notes?:string|null; reconciled_at?:string|null; reconciliation_reference?:string|null; reconciliation_notes?:string|null };
type DialogMode = 'due' | 'pay' | 'reconcile' | null;

function payableStatusLabel(status: string) {
  const labels: Record<string, string> = {
    approved: 'Aprobada para pago',
    pending: 'Pendiente de pago',
    open: 'Pendiente de pago',
    awaiting_due_date: 'Falta fecha de vencimiento',
    partially_paid: 'Pago parcial',
    partial: 'Pago parcial',
    paid: 'Pagada',
    reconciled: 'Pagada y confirmada',
    overdue: 'Atrasada',
    cancelled: 'Anulada',
    canceled: 'Anulada',
  };
  return labels[status.toLowerCase()] || 'Pendiente de revisión';
}

export default function PayablesPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/finance/payables', fetcher);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [dialogMode, setDialogMode] = useState<DialogMode>(null);
  const [selectedPayable, setSelectedPayable] = useState<Payable | null>(null);
  const [selectedPayment, setSelectedPayment] = useState<Payment | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentDate, setPaymentDate] = useState('');
  const [paymentReference, setPaymentReference] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [reconciliationReference, setReconciliationReference] = useState('');
  const [reconciliationNotes, setReconciliationNotes] = useState('');

  const payables: Payable[] = data?.payables || [];
  const payments: Payment[] = data?.payments || [];
  const canEdit = data?.canEdit === true;

  const outstandingByCurrency = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of payables) {
      const currency = row.currency || 'CLP';
      totals.set(currency, (totals.get(currency) || 0) + Number(row.outstanding_amount || 0));
    }
    return [...totals.entries()].filter(([, value]) => value > 0);
  }, [payables]);

  const dueMissing = payables.filter((row) => !row.due_date && Number(row.outstanding_amount) > 0);
  const overdue = payables.filter((row) => row.days_to_due != null && row.days_to_due < 0 && Number(row.outstanding_amount) > 0);
  const unreconciled = payments.filter((row) => !row.reconciled_at);
  const payableWithBalance = payables.filter((row) => row.due_date && Number(row.outstanding_amount) > 0);

  const post = async (body: unknown) => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/finance/payables', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(body) });
      if (!response.ok) throw new Error('No se pudo guardar el cambio. Revisa los datos e inténtalo de nuevo.');
      await mutate();
      return true;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'No se pudo completar la operación');
      return false;
    } finally { setBusy(false); }
  };

  const closeDialog = () => {
    setDialogMode(null); setSelectedPayable(null); setSelectedPayment(null); setDueDate(''); setPaymentAmount(''); setPaymentDate(''); setPaymentReference(''); setPaymentNotes(''); setReconciliationReference(''); setReconciliationNotes('');
  };
  const openDue = (row: Payable) => { setSelectedPayable(row); setDueDate(row.due_date || ''); setDialogMode('due'); setMessage(null); };
  const openPay = (row: Payable) => { setSelectedPayable(row); setPaymentAmount(String(Number(row.outstanding_amount || 0))); setPaymentDate(localDate()); setPaymentReference(''); setPaymentNotes(''); setDialogMode('pay'); setMessage(null); };
  const openReconcile = (row: Payment) => { setSelectedPayment(row); setReconciliationReference(''); setReconciliationNotes(''); setDialogMode('reconcile'); setMessage(null); };

  const saveDue = async () => {
    if (!selectedPayable || !dueDate) return;
    if (await post({ action:'set_due_date', payableId:selectedPayable.id, dueDate })) closeDialog();
  };
  const savePayment = async () => {
    if (!selectedPayable) return;
    const amount = Number(paymentAmount);
    if (!Number.isFinite(amount) || amount <= 0) return setMessage('Ingresa un monto de pago válido.');
    if (amount > Number(selectedPayable.outstanding_amount) + 0.0001) return setMessage('El pago no puede superar el saldo pendiente.');
    if (!paymentDate) return setMessage('Ingresa la fecha real del pago.');
    if (await post({ action:'record_payment', payableId:selectedPayable.id, amount, paymentDate, reference:paymentReference.trim() || null, notes:paymentNotes.trim() || null })) closeDialog();
  };
  const saveReconciliation = async () => {
    if (!selectedPayment) return;
    if (!reconciliationReference.trim()) return setMessage('Ingresa una referencia del banco o de contabilidad para confirmar el pago.');
    if (await post({ action:'reconcile_payment', paymentId:selectedPayment.id, reference:reconciliationReference.trim(), notes:reconciliationNotes.trim() || null })) closeDialog();
  };

  let nextTitle = 'Sin acción pendiente';
  let nextDescription = 'No hay facturas que requieran atención.';
  let nextControl: React.ReactNode = null;
  if (dueMissing.length) {
    nextTitle = 'Definir vencimiento';
    nextDescription = `La factura ${dueMissing[0].invoice_number} aún no tiene fecha de vencimiento.`;
    nextControl = <Button onClick={() => openDue(dueMissing[0])} disabled={!canEdit}><Clock3 className="mr-2 h-4 w-4"/>Definir vencimiento</Button>;
  } else if (overdue.length) {
    nextTitle = 'Pagar factura atrasada';
    nextDescription = `La factura ${overdue[0].invoice_number} está atrasada y aún tiene saldo por pagar.`;
    nextControl = <Button onClick={() => openPay(overdue[0])} disabled={!canEdit}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>;
  } else if (unreconciled.length) {
    nextTitle = 'Confirmar pago con el banco';
    nextDescription = `El pago de ${money(unreconciled[0].amount, unreconciled[0].currency || 'CLP')} está registrado, pero falta compararlo con el banco.`;
    nextControl = <Button onClick={() => openReconcile(unreconciled[0])} disabled={!canEdit}><Landmark className="mr-2 h-4 w-4"/>Confirmar pago</Button>;
  } else if (payableWithBalance.length) {
    nextTitle = 'Registrar pago';
    nextDescription = `La factura ${payableWithBalance[0].invoice_number} tiene fecha de vencimiento y saldo por pagar.`;
    nextControl = <Button onClick={() => openPay(payableWithBalance[0])} disabled={!canEdit}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>;
  }

  return <div className="space-y-6">
    <section className="border-b border-border/70 pb-6"><p className="text-sm font-medium text-muted-foreground">Finanzas · Pagos</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Facturas, vencimientos y pagos</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Define cuándo vence cada factura, registra los pagos realizados y confirma que coincidan con el banco. El gasto se cuenta al aceptar la recepción; registrar el pago no lo suma otra vez.</p></section>
    {message ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</div> : null}
    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}

    <Card className="shadow-none"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p><p className="mt-1 text-lg font-semibold">{nextTitle}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{nextDescription}</p></div>{nextControl}</CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Total por pagar</p>{outstandingByCurrency.length ? <div className="mt-1 space-y-1">{outstandingByCurrency.map(([currency,value]) => <p key={currency} className="text-xl font-semibold">{money(value,currency)}</p>)}</div> : <p className="mt-1 text-2xl font-semibold">0</p>}</CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Sin vencimiento</p><p className="mt-1 text-2xl font-semibold">{dueMissing.length}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Con atraso</p><p className="mt-1 text-2xl font-semibold">{overdue.length}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pagos por confirmar</p><p className="mt-1 text-2xl font-semibold">{unreconciled.length}</p></CardContent></Card>
    </div>

    <Card className="shadow-none"><CardHeader><CardTitle>Facturas por pagar</CardTitle><CardDescription>Revisa el saldo, la fecha de vencimiento y el estado de cada factura.</CardDescription></CardHeader><CardContent className="space-y-3">
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando facturas...</p> : null}
      {!isLoading && !payables.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay facturas aprobadas para pago.</p> : null}
      {payables.map((row)=><div key={row.id} className="rounded-lg border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">Factura {row.invoice_number}</p><Badge variant="outline">{payableStatusLabel(row.status)}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.supplier_name} · aprobada {money(row.approved_amount,row.currency)} · pagado {money(row.paid_amount,row.currency)}</p><p className="mt-1 text-sm">Saldo por pagar {money(row.outstanding_amount,row.currency)}{row.due_date ? ` · vence ${dateLabel(row.due_date)}` : ' · falta definir vencimiento'}</p></div><div className="flex flex-wrap gap-2">{!row.due_date && canEdit ? <Button size="sm" variant="outline" onClick={()=>openDue(row)}>Definir vencimiento</Button> : null}{row.due_date && Number(row.outstanding_amount)>0 && canEdit ? <Button size="sm" variant="outline" onClick={()=>openPay(row)}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>:null}</div></div></div>)}
    </CardContent></Card>

    <Card className="shadow-none"><CardHeader><CardTitle>Pagos realizados</CardTitle><CardDescription>Compara cada pago con el movimiento del banco. Así confirmas que se realizó y evitas registrar el gasto dos veces.</CardDescription></CardHeader><CardContent className="space-y-3">
      {!payments.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay pagos registrados.</p> : null}
      {payments.map((row)=><div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{money(row.amount,row.currency || 'CLP')} · {dateLabel(row.payment_date)}</p><p className="text-sm text-muted-foreground">{row.payment_reference || 'Sin referencia de pago'}</p></div>{row.reconciled_at ? <Badge><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Confirmado con el banco</Badge> : canEdit ? <Button size="sm" variant="outline" onClick={()=>openReconcile(row)}><Landmark className="mr-2 h-4 w-4"/>Confirmar pago</Button> : <Badge variant="outline"><Clock3 className="mr-1 h-3.5 w-3.5"/>Falta confirmar</Badge>}</div>)}
    </CardContent></Card>

    <Dialog open={dialogMode==='due'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Definir vencimiento</DialogTitle><DialogDescription>Factura {selectedPayable?.invoice_number}. Usa la fecha acordada en la factura; MOTIL no la calcula.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={saveDue} disabled={busy || !dueDate}>{busy?'Guardando…':'Guardar vencimiento'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogMode==='pay'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>Factura {selectedPayable?.invoice_number} · saldo {selectedPayable ? money(selectedPayable.outstanding_amount,selectedPayable.currency) : ''}. Registra solo los pagos que ya realizaste.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Monto</Label><Input type="number" min="0" step="any" max={selectedPayable?.outstanding_amount} value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)}/></div><div className="space-y-2"><Label>Fecha real de pago</Label><Input type="date" value={paymentDate} onChange={(e)=>setPaymentDate(e.target.value)}/></div></div><div className="space-y-2"><Label>Referencia de pago</Label><Input value={paymentReference} onChange={(e)=>setPaymentReference(e.target.value)} placeholder="Transferencia, comprobante u otra referencia (opcional)"/></div><div className="space-y-2"><Label>Notas</Label><Textarea value={paymentNotes} onChange={(e)=>setPaymentNotes(e.target.value)} placeholder="Opcional"/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={savePayment} disabled={busy || Number(paymentAmount)<=0 || !paymentDate}>{busy?'Registrando…':'Confirmar pago'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogMode==='reconcile'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Confirmar pago con el banco</DialogTitle><DialogDescription>Busca el pago en la cartola bancaria o en el registro contable. Esto solo confirma que se realizó; no registra el gasto otra vez.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Referencia del banco o de contabilidad</Label><Input value={reconciliationReference} onChange={(e)=>setReconciliationReference(e.target.value)} placeholder="Número de operación, comprobante u otra referencia"/></div><div className="space-y-2"><Label>Notas</Label><Textarea value={reconciliationNotes} onChange={(e)=>setReconciliationNotes(e.target.value)} placeholder="Opcional"/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={saveReconciliation} disabled={busy || !reconciliationReference.trim()}>{busy?'Guardando…':'Confirmar pago'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
