'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, ArrowRight, CheckCircle2, FileText, ReceiptText, ShieldCheck } from 'lucide-react';
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
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la información');
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

type PipelineRow = { order_id?: string | null; order_number?: string | null; order_status?: string | null; order_total?: number | null; currency?: string | null; supplier_name?: string | null; work_order_number?: string | null; work_order_title?: string | null; quantity_ordered?: number | null; quantity_received?: number | null };
type OrderLine = { id: string; order_id: string; product_code?: string | null; description?: string | null; unit?: string | null; quantity_ordered: number; quantity_received: number; unit_cost: number };
type InvoiceableLine = { organization_id: string; order_id: string; order_line_id: string; canonical_product_id?: string | null; product_code?: string | null; description?: string | null; unit?: string | null; unit_cost: number; quantity_ordered: number; quantity_accepted: number; quantity_invoiced: number; quantity_invoiceable: number };
type MatchSummary = { invoice_id: string; invoice_number: string; invoice_date: string; order_id: string; order_number: string; currency?: string | null; net_amount: number; tax_amount: number; total_amount: number; line_count: number; matched_line_count: number; pending_receipt_line_count: number; exception_line_count: number; match_status: string };
type MatchLine = { invoice_id: string; invoice_line_id: string; order_line_id: string; product_code?: string | null; description?: string | null; quantity_ordered: number; quantity_accepted: number; quantity_invoiced: number; prior_invoiced_quantity?: number | null; cumulative_invoiced_quantity?: number | null; ordered_unit_cost: number; invoiced_unit_cost: number; line_match_status: string };
type InvoiceState = { id: string; invoice_number: string; status: string; approved_for_payment_by?: string | null; approved_for_payment_at?: string | null; approval_basis?: 'matched' | 'accepted_exception' | null; approval_notes?: string | null };
type MatchException = { id: string; invoice_id: string; order_line_id?: string | null; exception_type: string; expected_value?: number | null; actual_value?: number | null; difference?: number | null; status: 'open' | 'accepted' | 'corrected' | 'rejected'; resolution_notes?: string | null; resolved_at?: string | null };
type DraftLine = { orderLineId: string; quantity: string; unitCost: string };
type LaudusInvoiceEvidence = {
  externalId: string;
  documentNumber: string | null;
  supplierName: string | null;
  issuedDate: string | null;
  dueDate: string | null;
  totalAmount: number;
  currency: string | null;
  paidAmount: number;
  outstandingAmount: number;
  paymentCount: number;
  paymentStatus: string;
};

function statusMeta(status: string) {
  if (status === 'matched') return { label: 'Coincide', icon: CheckCircle2, className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' };
  if (status === 'pending_receipt') return { label: 'Espera recepción', icon: ReceiptText, className: 'border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300' };
  return { label: 'Revisar', icon: AlertTriangle, className: 'border-destructive/30 bg-destructive/10 text-destructive' };
}

function lineStatusLabel(status: string) {
  const labels: Record<string, string> = { matched: 'Coincide', pending_receipt: 'Sin recepción aceptada', quantity_over_receipt: 'Facturación acumulada supera recepción', quantity_over_order: 'Facturación acumulada supera OC', price_mismatch: 'Precio distinto', product_mismatch: 'Producto distinto' };
  return labels[status] || status;
}

function exceptionLabel(type: string) {
  const labels: Record<string, string> = { quantity: 'Cantidad', unit_price: 'Precio unitario', total: 'Total factura', tax: 'Impuesto', missing_receipt: 'Recepción pendiente', unknown_product: 'Producto distinto', other: 'Otra diferencia' };
  return labels[type] || type;
}

export function ProgressiveInvoiceWorkflow() {
  const { data, error, isLoading, mutate } = useSWR('/api/procurement/operational-pipeline', fetcher);
  const { data: invoiceableData, error: invoiceableError, mutate: mutateInvoiceable } = useSWR('/api/procurement/invoiceable-lines', fetcher);
  const { data: laudusInvoiceData, error: laudusInvoiceError } = useSWR('/api/procurement/laudus-invoices', fetcher, { revalidateOnFocus: false, refreshInterval: 900000 });
  const [selectedOrder, setSelectedOrder] = useState<PipelineRow | null>(null);
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [taxAmount, setTaxAmount] = useState('');
  const [documentUrl, setDocumentUrl] = useState('');
  const [draftLines, setDraftLines] = useState<DraftLine[]>([]);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [expandedInvoice, setExpandedInvoice] = useState<string | null>(null);
  const [resolutionTarget, setResolutionTarget] = useState<MatchException | null>(null);
  const [resolutionDecision, setResolutionDecision] = useState<'accepted' | 'corrected' | 'rejected'>('accepted');
  const [resolutionNotes, setResolutionNotes] = useState('');

  const pipeline: PipelineRow[] = data?.pipeline || [];
  const orderLines: OrderLine[] = data?.orderLines || [];
  const summaries: MatchSummary[] = data?.invoiceMatchSummary || [];
  const matchLines: MatchLine[] = data?.invoiceMatchLines || [];
  const invoices: InvoiceState[] = data?.invoices || [];
  const invoiceExceptions: MatchException[] = data?.invoiceExceptions || [];
  const invoiceableLines: InvoiceableLine[] = invoiceableData?.rows || [];
  const canEdit = data?.canEdit !== false;
  const laudusInvoices: LaudusInvoiceEvidence[] = laudusInvoiceData?.rows || [];
  const laudusSummary = laudusInvoiceData?.summary || null;

  const orders = useMemo(() => {
    const map = new Map<string, PipelineRow>();
    for (const row of pipeline) if (row.order_id && !map.has(row.order_id)) map.set(row.order_id, row);
    return [...map.values()];
  }, [pipeline]);

  const invoiceableOrderIds = useMemo(() => new Set(invoiceableLines.filter((row) => Number(row.quantity_invoiceable) > 0).map((row) => row.order_id)), [invoiceableLines]);
  const invoicedOrderIds = useMemo(() => new Set(summaries.map((row) => row.order_id)), [summaries]);
  const ordersToInvoice = orders.filter((row) => row.order_id && invoiceableOrderIds.has(row.order_id));
  const ordersAwaitingFirstReceipt = orders.filter((row) => row.order_id && !invoicedOrderIds.has(row.order_id) && !invoiceableOrderIds.has(row.order_id) && Number(row.quantity_received || 0) <= 0);
  const openExceptions = invoiceExceptions.filter((row) => row.status === 'open');
  const exceptionInvoice = openExceptions.length ? summaries.find((row) => row.invoice_id === openExceptions[0].invoice_id) : null;
  const pendingReceiptInvoice = summaries.find((row) => row.match_status === 'pending_receipt' && invoices.find((invoice) => invoice.id === row.invoice_id)?.status !== 'approved');
  const approvableInvoice = summaries.find((row) => row.match_status === 'matched' && invoices.find((invoice) => invoice.id === row.invoice_id)?.status !== 'approved');
  const approvedCount = invoices.filter((row) => row.status === 'approved').length;

  const counts = {
    total: summaries.length,
    matched: summaries.filter((row) => row.match_status === 'matched').length,
    pending: summaries.filter((row) => row.match_status === 'pending_receipt').length,
    exceptions: openExceptions.length,
    approved: approvedCount,
  };

  const selectedInvoiceableLines = selectedOrder?.order_id ? invoiceableLines.filter((line) => line.order_id === selectedOrder.order_id && Number(line.quantity_invoiceable) > 0) : [];
  const netAmount = draftLines.reduce((sum, line) => sum + Number(line.quantity || 0) * Number(line.unitCost || 0), 0);
  const totalAmount = netAmount + Number(taxAmount || 0);
  const selectedCurrency = selectedOrder?.currency || 'CLP';

  const postAction = async (body: unknown, fallback: string) => {
    setBusy(true); setActionError(null);
    try {
      const response = await fetch('/api/procurement/operational-pipeline', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify(body) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || fallback);
      await Promise.all([mutate(), mutateInvoiceable()]);
      return true;
    } catch (err) {
      setActionError(err instanceof Error ? err.message : fallback);
      return false;
    } finally { setBusy(false); }
  };

  const openInvoice = (order: PipelineRow) => {
    const lines = invoiceableLines.filter((line) => line.order_id === order.order_id && Number(line.quantity_invoiceable) > 0);
    setSelectedOrder(order); setInvoiceNumber(''); setInvoiceDate(localDate()); setTaxAmount(''); setDocumentUrl(''); setActionError(null);
    setDraftLines(lines.map((line) => ({ orderLineId: line.order_line_id, quantity: String(Number(line.quantity_invoiceable || 0)), unitCost: String(Number(line.unit_cost || 0)) })));
  };

  const submitInvoice = async () => {
    if (!selectedOrder?.order_id) return;
    if (!invoiceNumber.trim()) return setActionError('Ingresa el número de factura.');
    if (!invoiceDate) return setActionError('Ingresa la fecha de factura.');
    const maxByLine = new Map(selectedInvoiceableLines.map((line) => [line.order_line_id, Number(line.quantity_invoiceable || 0)]));
    const lines = draftLines.map((line) => ({ order_line_id: line.orderLineId, quantity: Number(line.quantity), unit_cost: Number(line.unitCost) })).filter((line) => line.quantity > 0 && line.unit_cost >= 0);
    if (!lines.length) return setActionError('La factura debe contener al menos una línea con cantidad positiva.');
    const over = lines.find((line) => line.quantity > Number(maxByLine.get(line.order_line_id) || 0) + 0.0001);
    if (over) return setActionError('La cantidad facturada no puede superar el saldo recibido y aún no facturado.');
    const ok = await postAction({ action: 'create_supplier_invoice', orderId: selectedOrder.order_id, invoiceNumber: invoiceNumber.trim(), invoiceDate, netAmount, taxAmount: Number(taxAmount || 0), totalAmount, documentUrl: documentUrl.trim() || null, lines }, 'No se pudo registrar la factura');
    if (ok) setSelectedOrder(null);
  };

  const refreshMatch = async (invoiceId: string) => postAction({ action: 'refresh_supplier_invoice_match', invoiceId }, 'No se pudo recalcular el match');
  const approvePayment = async (invoiceId: string) => postAction({ action: 'approve_supplier_invoice_payment', invoiceId }, 'La factura todavía no es aprobable para pago');

  const openResolution = (exception: MatchException, decision: 'accepted' | 'corrected' | 'rejected') => {
    setResolutionTarget(exception); setResolutionDecision(decision); setResolutionNotes(''); setActionError(null);
  };

  const resolveException = async () => {
    if (!resolutionTarget) return;
    if (!resolutionNotes.trim()) return setActionError('La resolución requiere una nota trazable.');
    const invoiceId = resolutionTarget.invoice_id;
    const ok = await postAction({ action: 'resolve_supplier_invoice_exception', exceptionId: resolutionTarget.id, decision: resolutionDecision, notes: resolutionNotes.trim() }, 'No se pudo resolver la excepción');
    if (ok) { setResolutionTarget(null); setResolutionNotes(''); if (resolutionDecision === 'corrected') await refreshMatch(invoiceId); }
  };

  let nextActionLabel = 'Sin acción pendiente';
  let nextActionDescription = 'No hay facturas ni órdenes operativas que requieran intervención.';
  let nextActionControl: React.ReactNode = null;

  if (openExceptions.length && exceptionInvoice) {
    nextActionLabel = 'Resolver excepción';
    nextActionDescription = `Factura ${exceptionInvoice.invoice_number}: existe una diferencia abierta que bloquea la aprobación de pago.`;
    nextActionControl = <Button onClick={() => { setExpandedInvoice(exceptionInvoice.invoice_id); openResolution(openExceptions[0], 'accepted'); }} disabled={!canEdit || busy}><AlertTriangle className="mr-2 h-4 w-4" />Resolver excepción</Button>;
  } else if (pendingReceiptInvoice) {
    nextActionLabel = 'Completar recepción';
    nextActionDescription = `Factura ${pendingReceiptInvoice.invoice_number}: el three-way match espera recepción aceptada.`;
    nextActionControl = <Button asChild><Link href="/dashboard/compras/flujo"><ReceiptText className="mr-2 h-4 w-4" />Ir a recepción</Link></Button>;
  } else if (approvableInvoice) {
    nextActionLabel = 'Aprobar pago';
    nextActionDescription = `Factura ${approvableInvoice.invoice_number}: OC, recepción y factura coinciden, incluida la facturación acumulada previa.`;
    nextActionControl = <Button onClick={() => approvePayment(approvableInvoice.invoice_id)} disabled={!canEdit || busy}><ShieldCheck className="mr-2 h-4 w-4" />Aprobar pago</Button>;
  } else if (ordersToInvoice.length) {
    nextActionLabel = 'Registrar factura';
    nextActionDescription = `${ordersToInvoice[0].order_number || 'OC'} tiene recepción aceptada pendiente de facturar.`;
    nextActionControl = <Button onClick={() => openInvoice(ordersToInvoice[0])} disabled={!canEdit || busy}><FileText className="mr-2 h-4 w-4" />Registrar factura</Button>;
  } else if (ordersAwaitingFirstReceipt.length) {
    nextActionLabel = 'Registrar recepción';
    nextActionDescription = `${ordersAwaitingFirstReceipt[0].order_number || 'OC'} todavía no tiene recepción aceptada facturable.`;
    nextActionControl = <Button asChild><Link href="/dashboard/compras/flujo"><ReceiptText className="mr-2 h-4 w-4" />Ir a recepción</Link></Button>;
  } else if (approvedCount > 0) {
    nextActionLabel = 'Continuar a Tesorería';
    nextActionDescription = 'Las facturas aprobadas pasan a cuentas por pagar; el pago no vuelve a reconocer costo operacional.';
    nextActionControl = <Button asChild><Link href="/dashboard/finanzas/pagos"><ArrowRight className="mr-2 h-4 w-4" />Ir a Pagos</Link></Button>;
  }

  return <div className="space-y-6">
    <section className="border-b border-border/70 pb-6"><p className="text-sm font-medium text-muted-foreground">Abastecimiento · Control de factura</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Factura → match → aprobación → pago</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Una sola decisión principal por vez. El three-way match controla OC, recepción aceptada, factura actual y facturación acumulada previa.</p></section>
    {actionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}
    {error || invoiceableError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error?.message || invoiceableError?.message}</div> : null}
    {laudusInvoiceError ? <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-muted-foreground">La evidencia de facturas Laudus no está disponible. El flujo operacional MOTIL sigue separado y no se reemplaza por cero.</div> : null}

    <Card className="shadow-none"><CardContent className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p><p className="mt-1 text-lg font-semibold">{nextActionLabel}</p><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{nextActionDescription}</p></div>{nextActionControl}</CardContent></Card>

    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {[['Facturas MOTIL', counts.total], ['Coinciden', counts.matched], ['Esperan recepción', counts.pending], ['Excepciones abiertas', counts.exceptions], ['Aprobadas pago', counts.approved]].map(([label, value]) => <Card key={String(label)} className="shadow-none"><CardContent className="p-4"><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></CardContent></Card>)}
    </div>

    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Facturas Laudus</CardTitle>
        <CardDescription>Evidencia ERP en sólo lectura. Una factura Laudus no se convierte automáticamente en factura operacional MOTIL, three-way match ni aprobación de pago.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {laudusSummary ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ['Total fuente', laudusSummary.total],
            ['Pagadas', laudusSummary.paid],
            ['Pago parcial', laudusSummary.partiallyPaid],
            ['Impagas', laudusSummary.unpaid],
          ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-lg font-semibold">{Number(value || 0).toLocaleString('es-CL')}</p></div>)}
        </div> : <p className="text-sm text-muted-foreground">Consultando evidencia Laudus…</p>}
        {laudusInvoices.length ? <div className="divide-y rounded-lg border">
          {laudusInvoices.slice(0, 10).map((row) => <div key={row.externalId} className="grid gap-2 p-3 text-sm lg:grid-cols-[120px_1fr_130px_150px] lg:items-center">
            <div><p className="font-medium">Factura {row.documentNumber || row.externalId}</p><p className="text-xs text-muted-foreground">Fuente Laudus</p></div>
            <div><p className="font-medium">{row.supplierName || 'Proveedor sin nombre'}</p><p className="text-xs text-muted-foreground">{row.dueDate ? `Vence ${new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(row.dueDate))}` : 'Sin vencimiento acreditado'}</p></div>
            <Badge variant="outline">{row.paymentStatus === 'partially_paid' ? 'Pago parcial' : 'Impaga'}</Badge>
            <p className="font-medium tabular-nums lg:text-right">{money(row.outstandingAmount, row.currency || 'CLP')}</p>
          </div>)}
        </div> : laudusSummary && laudusSummary.open === 0 ? <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Laudus no reporta facturas abiertas.</p> : null}
        {laudusSummary?.open > laudusInvoices.length ? <p className="text-xs text-muted-foreground">Se muestran las obligaciones abiertas de mayor saldo, hasta {laudusSummary.rowsShown}. El universo fuente permanece en Laudus y no se duplica en MOTIL.</p> : null}
      </CardContent>
    </Card>

    <Card className="shadow-none"><CardHeader><CardTitle>Expedientes MOTIL</CardTitle><CardDescription>El detalle conserva evidencia de esta factura y del acumulado de la OC, sin competir con la acción principal.</CardDescription></CardHeader><CardContent className="space-y-3">
      {isLoading ? <p className="text-sm text-muted-foreground">Cargando facturas...</p> : null}
      {!isLoading && !summaries.length ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">No hay facturas registradas para contrastar.</p> : null}
      {summaries.map((summary) => {
        const meta = statusMeta(summary.match_status); const Icon = meta.icon; const invoice = invoices.find((row) => row.id === summary.invoice_id); const exceptions = invoiceExceptions.filter((row) => row.invoice_id === summary.invoice_id); const open = expandedInvoice === summary.invoice_id; const lines = matchLines.filter((row) => row.invoice_id === summary.invoice_id); const currency = summary.currency || 'CLP';
        return <div key={summary.invoice_id} className="rounded-lg border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">Factura {summary.invoice_number}</p><Badge variant="outline" className={meta.className}><Icon className="mr-1 h-3.5 w-3.5" />{meta.label}</Badge>{invoice?.status === 'approved' ? <Badge><ShieldCheck className="mr-1 h-3.5 w-3.5" />Pago aprobado</Badge> : null}</div><p className="mt-1 text-sm text-muted-foreground">{summary.order_number} · {money(summary.total_amount, currency)}</p><p className="mt-1 text-xs text-muted-foreground">{summary.matched_line_count}/{summary.line_count} líneas coinciden · {exceptions.filter((row) => row.status === 'open').length} excepción(es) abiertas</p></div><Button size="sm" variant="outline" onClick={() => setExpandedInvoice(open ? null : summary.invoice_id)}>{open ? 'Ocultar detalle' : 'Ver detalle'}</Button></div>
        {open ? <div className="mt-4 space-y-4 border-t pt-3"><div className="space-y-2">{lines.map((line) => <div key={line.invoice_line_id} className="grid gap-2 rounded-md bg-muted/40 p-3 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-medium">{line.product_code || line.description || 'Línea'}</p><p className="text-xs text-muted-foreground">OC {Number(line.quantity_ordered)} · recibido aceptado {Number(line.quantity_accepted)} · factura actual {Number(line.quantity_invoiced)}</p><p className="mt-1 text-xs text-muted-foreground">Facturado antes {Number(line.prior_invoiced_quantity || 0)} · acumulado {Number(line.cumulative_invoiced_quantity ?? line.quantity_invoiced)}</p></div><div className="text-left sm:text-right"><Badge variant="outline">{lineStatusLabel(line.line_match_status)}</Badge><p className="mt-1 text-xs text-muted-foreground">{money(line.ordered_unit_cost, currency)} → {money(line.invoiced_unit_cost, currency)}</p></div></div>)}</div>{exceptions.length ? <div className="space-y-2"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Resolución de excepciones</p>{exceptions.map((exception) => <div key={exception.id} className="rounded-md border p-3 text-sm"><div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between"><div><div className="flex items-center gap-2"><span className="font-medium">{exceptionLabel(exception.exception_type)}</span><Badge variant="outline">{exception.status}</Badge></div>{exception.resolution_notes ? <p className="mt-2 text-xs">{exception.resolution_notes}</p> : null}</div>{exception.status === 'open' ? <Button size="sm" variant="outline" onClick={() => openResolution(exception, 'accepted')} disabled={!canEdit || busy}>Resolver</Button> : null}</div></div>)}</div> : null}</div> : null}
        </div>;
      })}
    </CardContent></Card>

    {ordersToInvoice.length > 1 ? <Card className="shadow-none"><CardHeader><CardTitle>Otros saldos facturables</CardTitle><CardDescription>Sólo aparecen recepciones aceptadas que aún no han sido facturadas.</CardDescription></CardHeader><CardContent className="space-y-2">{ordersToInvoice.slice(1).map((order) => { const balance = invoiceableLines.filter((line) => line.order_id === order.order_id).reduce((sum, line) => sum + Number(line.quantity_invoiceable || 0), 0); return <div key={order.order_id} className="flex items-center justify-between rounded-md border p-3"><div><p className="text-sm font-medium">{order.order_number}</p><p className="text-xs text-muted-foreground">{order.supplier_name || 'Proveedor'} · {balance} unidad(es) facturables</p></div><Button size="sm" variant="outline" onClick={() => openInvoice(order)} disabled={!canEdit || busy}>Registrar</Button></div>; })}</CardContent></Card> : null}

    <Dialog open={Boolean(selectedOrder)} onOpenChange={(open) => { if (!open) setSelectedOrder(null); }}><DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"><DialogHeader><DialogTitle>Registrar factura proveedor</DialogTitle><DialogDescription>{selectedOrder?.order_number} · sólo se propone el saldo recibido, aceptado y todavía no facturado.</DialogDescription></DialogHeader><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label>Número de factura</Label><Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} /></div><div className="space-y-2"><Label>Fecha</Label><Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} /></div><div className="space-y-2"><Label>Impuesto</Label><Input type="number" min="0" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} /></div><div className="space-y-2"><Label>URL documento</Label><Input value={documentUrl} onChange={(e) => setDocumentUrl(e.target.value)} placeholder="Opcional" /></div></div><div className="space-y-3">{selectedInvoiceableLines.map((line) => { const draft = draftLines.find((item) => item.orderLineId === line.order_line_id); return <div key={line.order_line_id} className="grid gap-3 rounded-lg border p-3 sm:grid-cols-[1fr_120px_140px] sm:items-end"><div><p className="text-sm font-medium">{line.product_code || line.description || 'Producto'}</p><p className="text-xs text-muted-foreground">OC {Number(line.quantity_ordered)} · aceptado {Number(line.quantity_accepted)} · ya facturado {Number(line.quantity_invoiced)}</p><p className="mt-1 text-xs font-medium">Facturable ahora: {Number(line.quantity_invoiceable)} {line.unit || ''}</p></div><div className="space-y-1"><Label className="text-xs">Cantidad</Label><Input type="number" min="0" max={Number(line.quantity_invoiceable)} step="any" value={draft?.quantity || ''} onChange={(e) => setDraftLines((rows) => rows.map((row) => row.orderLineId === line.order_line_id ? { ...row, quantity: e.target.value } : row))} /></div><div className="space-y-1"><Label className="text-xs">Precio unitario</Label><Input type="number" min="0" step="any" value={draft?.unitCost || ''} onChange={(e) => setDraftLines((rows) => rows.map((row) => row.orderLineId === line.order_line_id ? { ...row, unitCost: e.target.value } : row))} /></div></div>; })}</div><div className="rounded-lg bg-muted/50 p-3 text-sm"><div className="flex justify-between"><span>Neto</span><span>{money(netAmount, selectedCurrency)}</span></div><div className="mt-1 flex justify-between"><span>Impuesto</span><span>{money(taxAmount, selectedCurrency)}</span></div><div className="mt-2 flex justify-between border-t pt-2 font-medium"><span>Total</span><span>{money(totalAmount, selectedCurrency)}</span></div></div><DialogFooter><Button variant="outline" onClick={() => setSelectedOrder(null)}>Cancelar</Button><Button onClick={submitInvoice} disabled={busy || !canEdit}>{busy ? 'Guardando...' : 'Guardar y validar'}</Button></DialogFooter></DialogContent></Dialog>

    <Dialog open={Boolean(resolutionTarget)} onOpenChange={(open) => { if (!open) setResolutionTarget(null); }}><DialogContent><DialogHeader><DialogTitle>{resolutionDecision === 'accepted' ? 'Aceptar excepción de pago' : resolutionDecision === 'rejected' ? 'Rechazar excepción' : 'Marcar diferencia corregida'}</DialogTitle><DialogDescription>La decisión queda registrada con usuario, fecha y nota.</DialogDescription></DialogHeader><div className="grid grid-cols-3 gap-2"><Button type="button" variant={resolutionDecision === 'accepted' ? 'default' : 'outline'} onClick={() => setResolutionDecision('accepted')}>Aceptar</Button><Button type="button" variant={resolutionDecision === 'corrected' ? 'default' : 'outline'} onClick={() => setResolutionDecision('corrected')}>Corregida</Button><Button type="button" variant={resolutionDecision === 'rejected' ? 'default' : 'outline'} onClick={() => setResolutionDecision('rejected')}>Rechazar</Button></div><div className="space-y-2"><Label>Fundamento de la decisión</Label><Textarea value={resolutionNotes} onChange={(e) => setResolutionNotes(e.target.value)} placeholder="Describe la evidencia que sustenta esta decisión." /></div><DialogFooter><Button variant="outline" onClick={() => setResolutionTarget(null)}>Cancelar</Button><Button onClick={resolveException} disabled={busy || !resolutionNotes.trim()}>{busy ? 'Guardando...' : 'Confirmar decisión'}</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
