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
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar cuentas por pagar');
  return payload;
};

const money = (value: unknown, currency = 'CLP') => {
  try {
    return new Intl.NumberFormat('es-CL', { style: 'currency', currency, maximumFractionDigits: currency === 'CLP' ? 0 : 2 }).format(Number(value || 0));
  } catch {
    return `${currency} ${Number(value || 0).toLocaleString('es-CL')}`;
  }
};
const localDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Santiago' }).format(new Date());

type Payable = { id:string; invoice_number:string; supplier_name:string; approved_amount:number; paid_amount:number; outstanding_amount:number; due_date?:string|null; days_to_due?:number|null; status:string; currency:string };
type Payment = { id:string; payable_id:string; amount:number; currency:string; payment_date:string; payment_reference?:string|null; notes?:string|null; reconciled_at?:string|null; reconciliation_reference?:string|null; reconciliation_notes?:string|null };
type DialogMode = 'due' | 'pay' | 'reconcile' | null;

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

  const overdueBySupplier = useMemo(() => {
    const groups = new Map<string, { supplierName: string; items: number; amount: number; oldestDays: number }>();
    for (const row of overdue) {
      const key = row.supplier_name || 'Sin proveedor';
      const current = groups.get(key) || { supplierName: key, items: 0, amount: 0, oldestDays: 0 };
      current.items += 1;
      current.amount += Number(row.outstanding_amount || 0);
      current.oldestDays = Math.max(current.oldestDays, Math.abs(Number(row.days_to_due || 0)));
      groups.set(key, current);
    }
    const total = [...groups.values()].reduce((sum, item) => sum + item.amount, 0);
    return [...groups.values()]
      .map((item) => ({ ...item, sharePct: total > 0 ? Math.round((item.amount / total) * 1000) / 10 : 0 }))
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 8);
  }, [overdue]);

  const overdueSupplierConcentration = overdueBySupplier.slice(0, 5).reduce((sum, item) => sum + item.sharePct, 0);

  const post = async (body: unknown) => {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/finance/payables', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(body) });
      const payload = await response.json().catch(()=>null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo completar la operación');
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
    if (!reconciliationReference.trim()) return setMessage('La conciliación requiere una referencia bancaria o contable.');
    if (await post({ action:'reconcile_payment', paymentId:selectedPayment.id, reference:reconciliationReference.trim(), notes:reconciliationNotes.trim() || null })) closeDialog();
  };

  let nextTitle = 'Sin acción pendiente';
  let nextDescription = 'No hay obligaciones de pago que requieran intervención.';
  let nextControl: React.ReactNode = null;
  if (dueMissing.length) {
    nextTitle = 'Definir vencimiento';
    nextDescription = `Factura ${dueMissing[0].invoice_number}: la obligación aprobada aún no tiene fecha de vencimiento.`;
    nextControl = <Button onClick={() => openDue(dueMissing[0])} disabled={!canEdit}><Clock3 className="mr-2 h-4 w-4"/>Definir vencimiento</Button>;
  } else if (overdue.length) {
    nextTitle = 'Registrar pago vencido';
    nextDescription = `Factura ${overdue[0].invoice_number}: mantiene saldo vencido pendiente de pago.`;
    nextControl = <Button onClick={() => openPay(overdue[0])} disabled={!canEdit}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>;
  } else if (unreconciled.length) {
    nextTitle = 'Conciliar pago';
    nextDescription = `Pago de ${money(unreconciled[0].amount, unreconciled[0].currency || 'CLP')} registrado y aún no conciliado.`;
    nextControl = <Button onClick={() => openReconcile(unreconciled[0])} disabled={!canEdit}><Landmark className="mr-2 h-4 w-4"/>Conciliar</Button>;
  } else if (payableWithBalance.length) {
    nextTitle = 'Registrar pago';
    nextDescription = `Factura ${payableWithBalance[0].invoice_number}: tiene vencimiento definido y saldo pendiente.`;
    nextControl = <Button onClick={() => openPay(payableWithBalance[0])} disabled={!canEdit}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>;
  }

  return <div className="space-y-6">
    <section className="border-b border-border/70 pb-6"><p className="text-sm font-medium text-muted-foreground">Finanzas · Tesorería</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Factura aprobada → vencimiento → pago → conciliación</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Una sola acción principal por vez. El costo ya fue reconocido por la recepción aceptada; Tesorería administra obligación, salida de caja y conciliación.</p></section>
    {message ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{message}</div> : null}
    {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}

    <Card className="shadow-none"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p><p className="mt-1 text-lg font-semibold">{nextTitle}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{nextDescription}</p></div>{nextControl}</CardContent></Card>

    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Saldo pendiente</p>{outstandingByCurrency.length ? <div className="mt-1 space-y-1">{outstandingByCurrency.map(([currency,value]) => <p key={currency} className="text-xl font-semibold">{money(value,currency)}</p>)}</div> : <p className="mt-1 text-2xl font-semibold">0</p>}</CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Sin vencimiento</p><p className="mt-1 text-2xl font-semibold">{dueMissing.length}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Vencidas</p><p className="mt-1 text-2xl font-semibold">{overdue.length}</p></CardContent></Card>
      <Card className="shadow-none"><CardContent className="p-5"><p className="text-sm text-muted-foreground">Pagos por conciliar</p><p className="mt-1 text-2xl font-semibold">{unreconciled.length}</p></CardContent></Card>
    </div>

    {overdueBySupplier.length ? (
      <Card className="shadow-none">
        <CardHeader>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Concentración vencida</p>
              <CardTitle className="mt-1">Proveedores que explican la mayor exposición</CardTitle>
              <CardDescription>
                Top 5 concentra {number(overdueSupplierConcentration)}% del saldo vencido. Prioriza revisión por proveedor antes de recorrer factura por factura.
              </CardDescription>
            </div>
            <Badge variant="outline">{overdue.length} partidas vencidas</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="divide-y rounded-lg border">
            {overdueBySupplier.map((item, index) => (
              <div key={item.supplierName} className="grid gap-2 px-4 py-3 sm:grid-cols-[42px_minmax(0,1fr)_120px_110px] sm:items-center">
                <div className="text-xs font-semibold tabular-nums text-muted-foreground">{String(index + 1).padStart(2, '0')}</div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{item.supplierName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{item.items} partidas · hasta {item.oldestDays} días de atraso</p>
                </div>
                <div className="text-sm font-semibold tabular-nums sm:text-right">{money(item.amount, 'CLP')}</div>
                <div className="text-xs tabular-nums text-muted-foreground sm:text-right">{number(item.sharePct)}%</div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Concentración observada sobre obligaciones vencidas en MOTIL. No implica prioridad automática de pago ni evaluación de riesgo del proveedor.
          </p>
        </CardContent>
      </Card>
    ) : null}

    <Card className="shadow-none"><CardHeader><CardTitle>Obligaciones</CardTitle><CardDescription>Detalle completo; la acción prioritaria se concentra arriba.</CardDescription></CardHeader><CardContent className="space-y-3">
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando...</p> : null}
      {!isLoading && !payables.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay facturas aprobadas para pago.</p> : null}
      {payables.map((row)=><div key={row.id} className="rounded-lg border p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">Factura {row.invoice_number}</p><Badge variant="outline">{row.status}</Badge></div><p className="mt-1 text-sm text-muted-foreground">{row.supplier_name} · aprobado {money(row.approved_amount,row.currency)} · pagado {money(row.paid_amount,row.currency)}</p><p className="mt-1 text-sm">Saldo {money(row.outstanding_amount,row.currency)}{row.due_date ? ` · vence ${row.due_date}` : ' · vencimiento pendiente'}</p></div><div className="flex flex-wrap gap-2">{!row.due_date && canEdit ? <Button size="sm" variant="outline" onClick={()=>openDue(row)}>Definir vencimiento</Button> : null}{row.due_date && Number(row.outstanding_amount)>0 && canEdit ? <Button size="sm" variant="outline" onClick={()=>openPay(row)}><ReceiptText className="mr-2 h-4 w-4"/>Registrar pago</Button>:null}</div></div></div>)}
    </CardContent></Card>

    <Card className="shadow-none"><CardHeader><CardTitle>Pagos y conciliación</CardTitle><CardDescription>La conciliación no reconoce gasto; confirma la salida de caja con referencia trazable.</CardDescription></CardHeader><CardContent className="space-y-3">
      {!payments.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay pagos registrados.</p> : null}
      {payments.map((row)=><div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"><div><p className="font-medium">{money(row.amount,row.currency || 'CLP')} · {row.payment_date}</p><p className="text-sm text-muted-foreground">{row.payment_reference || 'Sin referencia de pago'}</p></div>{row.reconciled_at ? <Badge><CheckCircle2 className="mr-1 h-3.5 w-3.5"/>Conciliado</Badge> : canEdit ? <Button size="sm" variant="outline" onClick={()=>openReconcile(row)}><Landmark className="mr-2 h-4 w-4"/>Conciliar</Button> : <Badge variant="outline"><Clock3 className="mr-1 h-3.5 w-3.5"/>Pendiente</Badge>}</div>)}
    </CardContent></Card>

    <Dialog open={dialogMode==='due'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Definir vencimiento</DialogTitle><DialogDescription>Factura {selectedPayable?.invoice_number}. Usa la fecha contractual o documental real; Motil no la infiere.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Fecha de vencimiento</Label><Input type="date" value={dueDate} onChange={(e)=>setDueDate(e.target.value)}/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={saveDue} disabled={busy || !dueDate}>{busy?'Guardando…':'Guardar vencimiento'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogMode==='pay'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Registrar pago</DialogTitle><DialogDescription>Factura {selectedPayable?.invoice_number} · saldo {selectedPayable ? money(selectedPayable.outstanding_amount,selectedPayable.currency) : ''}. Registra sólo una salida de caja efectivamente realizada.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Monto</Label><Input type="number" min="0" step="any" max={selectedPayable?.outstanding_amount} value={paymentAmount} onChange={(e)=>setPaymentAmount(e.target.value)}/></div><div className="space-y-2"><Label>Fecha real de pago</Label><Input type="date" value={paymentDate} onChange={(e)=>setPaymentDate(e.target.value)}/></div></div><div className="space-y-2"><Label>Referencia de pago</Label><Input value={paymentReference} onChange={(e)=>setPaymentReference(e.target.value)} placeholder="Transferencia, comprobante u otra referencia (opcional)"/></div><div className="space-y-2"><Label>Notas</Label><Textarea value={paymentNotes} onChange={(e)=>setPaymentNotes(e.target.value)} placeholder="Opcional"/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={savePayment} disabled={busy || Number(paymentAmount)<=0 || !paymentDate}>{busy?'Registrando…':'Confirmar pago'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={dialogMode==='reconcile'} onOpenChange={(open)=>{ if(!open) closeDialog(); }}><DialogContent><DialogHeader><DialogTitle>Conciliar pago</DialogTitle><DialogDescription>Confirma el movimiento contra evidencia bancaria o contable. Esta acción no vuelve a reconocer gasto.</DialogDescription></DialogHeader><div className="space-y-2"><Label>Referencia de conciliación</Label><Input value={reconciliationReference} onChange={(e)=>setReconciliationReference(e.target.value)} placeholder="Referencia bancaria o contable"/></div><div className="space-y-2"><Label>Notas de conciliación</Label><Textarea value={reconciliationNotes} onChange={(e)=>setReconciliationNotes(e.target.value)} placeholder="Opcional"/></div><DialogFooter><Button variant="outline" onClick={closeDialog}>Cancelar</Button><Button onClick={saveReconciliation} disabled={busy || !reconciliationReference.trim()}>{busy?'Conciliando…':'Confirmar conciliación'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
