'use client';

import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, FileCheck2, RotateCcw, Star } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';

interface Order { id: string; order_number: string; supplier_id: string; currency: string; total_amount: number; }
interface OrderLine { id: string; order_id: string; canonical_product_id: string; product_code: string | null; description: string | null; quantity_ordered: number; quantity_received: number; unit_cost: number; }
interface Receipt { id: string; receipt_number: string; order_id: string; }
interface ReceiptLine { id: string; receipt_id: string; order_line_id: string; canonical_product_id: string; quantity_rejected: number; unit_cost: number; }
interface SupplierPerformance { supplier_id: string; supplier_name: string | null; supplier_legal_name?: string | null; supplier_tax_id: string | null; total_orders: number; completed_orders: number; delivery_scored_orders: number; delivery_score: number | null; returns_count: number; operational_score: number | null; }
interface SupplierReturn { id: string; return_number: string; reason: string; status: string; }
interface SupplierInvoice { id: string; invoice_number: string; invoice_date: string; total_amount: number; status: string; procurement_match_exceptions?: Array<{ id: string; status: string }>; }
interface SupplierControlResponse { returns: SupplierReturn[]; invoices: SupplierInvoice[]; orders: Order[]; orderLines: OrderLine[]; receipts: Receipt[]; receiptLines: ReceiptLine[]; supplierPerformance: SupplierPerformance[]; }

const currency = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const statusLabel: Record<string, string> = { draft: 'Borrador', approved: 'Aprobada', sent: 'Enviada', received_by_supplier: 'Recibida por proveedor', resolved: 'Resuelta', cancelled: 'Cancelada', pending_match: 'Pendiente de revisión', matched: 'Coincide', exception: 'Con diferencias', rejected: 'Rechazada' };

export default function SupplierControlPage() {
  const [data, setData] = useState<SupplierControlResponse>({ returns: [], invoices: [], orders: [], orderLines: [], receipts: [], receiptLines: [], supplierPerformance: [] });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [invoiceOrderId, setInvoiceOrderId] = useState('');
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [invoiceDate, setInvoiceDate] = useState(new Date().toISOString().slice(0, 10));
  const [taxAmount, setTaxAmount] = useState('0');
  const [returnReceiptId, setReturnReceiptId] = useState('');
  const [returnReason, setReturnReason] = useState('');
  const [resolutionType, setResolutionType] = useState('replacement');

  const load = useCallback(async () => {
    setError('');
    const response = await apiFetch('/api/procurement/supplier-control');
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudo cargar el control de proveedores.');
    setData(payload);
  }, []);

  useEffect(() => {
    load().catch((cause) => setError(cause instanceof Error ? cause.message : 'No se pudo cargar la información.')).finally(() => setLoading(false));
  }, [load]);

  const invoiceOrder = data.orders.find((order) => order.id === invoiceOrderId);
  const invoiceLines = data.orderLines.filter((line) => line.order_id === invoiceOrderId);
  const invoiceNet = invoiceLines.reduce((total, line) => total + Number(line.quantity_received || line.quantity_ordered) * Number(line.unit_cost || 0), 0);
  const invoiceTotal = invoiceNet + Number(taxAmount || 0);

  const selectedReceipt = data.receipts.find((receipt) => receipt.id === returnReceiptId);
  const rejectedLines = data.receiptLines.filter((line) => line.receipt_id === returnReceiptId && Number(line.quantity_rejected) > 0);
  const returnOrder = data.orders.find((order) => order.id === selectedReceipt?.order_id);

  const summary = useMemo(() => ({
    returns: data.returns.filter((item) => !['resolved', 'cancelled'].includes(item.status)).length,
    exceptions: data.invoices.reduce((total, invoice) => total + (invoice.procurement_match_exceptions || []).filter((item) => item.status === 'open').length, 0),
    matched: data.invoices.filter((item) => item.status === 'matched').length,
    suppliers: data.supplierPerformance.length,
  }), [data]);

  async function submitInvoice(event: FormEvent) {
    event.preventDefault();
    if (!invoiceOrder || invoiceLines.length === 0) return setError('Selecciona una orden con productos recibidos.');
    setSaving('invoice'); setError(''); setMessage('');
    try {
      const lines = invoiceLines.map((line) => ({ orderLineId: line.id, canonicalProductId: line.canonical_product_id, quantity: Number(line.quantity_received || line.quantity_ordered), unitCost: Number(line.unit_cost) }));
      const response = await apiFetch('/api/procurement/supplier-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_invoice', orderId: invoiceOrder.id, supplierId: invoiceOrder.supplier_id, invoiceNumber, invoiceDate, currency: invoiceOrder.currency, taxAmount: Number(taxAmount || 0), totalAmount: invoiceTotal, lines }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo registrar la factura.');
      setMessage(payload.status === 'matched' ? 'Factura registrada y conciliada sin diferencias.' : `Factura registrada con ${payload.exceptions} diferencia(s) por revisar.`);
      setInvoiceNumber(''); setInvoiceOrderId(''); setTaxAmount('0'); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la factura.'); } finally { setSaving(''); }
  }

  async function submitReturn(event: FormEvent) {
    event.preventDefault();
    if (!selectedReceipt || !returnOrder || rejectedLines.length === 0) return setError('Selecciona una recepción con productos rechazados.');
    setSaving('return'); setError(''); setMessage('');
    try {
      const lines = rejectedLines.map((line) => ({ receiptLineId: line.id, orderLineId: line.order_line_id, canonicalProductId: line.canonical_product_id, quantity: Number(line.quantity_rejected), unitCost: Number(line.unit_cost) }));
      const response = await apiFetch('/api/procurement/supplier-control', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'create_return', orderId: returnOrder.id, receiptId: selectedReceipt.id, supplierId: returnOrder.supplier_id, reason: returnReason, resolutionType, lines }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo registrar la devolución.');
      setMessage(`Devolución ${payload.returnNumber} creada correctamente.`); setReturnReceiptId(''); setReturnReason(''); await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo registrar la devolución.'); } finally { setSaving(''); }
  }

  const cards = [
    { label: 'Devoluciones abiertas', value: summary.returns, Icon: RotateCcw },
    { label: 'Diferencias por resolver', value: summary.exceptions, Icon: AlertTriangle },
    { label: 'Facturas coincidentes', value: summary.matched, Icon: FileCheck2 },
    { label: 'Proveedores evaluados', value: summary.suppliers, Icon: Star },
  ];

  return <main className="space-y-6">
    <header><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Compras</p><h1 className="mt-1 text-2xl font-semibold tracking-tight">Control de proveedores</h1><p className="mt-1 text-sm text-muted-foreground">Devoluciones, revisión de facturas y cumplimiento calculado desde órdenes y recepciones reales.</p></header>
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{cards.map(({ label, value, Icon }) => <article key={label} className="rounded-lg border bg-card p-4"><div className="flex items-center justify-between text-muted-foreground"><span className="text-sm">{label}</span><Icon className="h-4 w-4" /></div><p className="mt-3 text-2xl font-semibold">{value}</p></article>)}</section>
    {loading && <p className="rounded-lg border p-5 text-sm text-muted-foreground">Cargando información…</p>}
    {error && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</p>}
    {message && <p className="rounded-lg border bg-muted/30 p-4 text-sm">{message}</p>}

    {!loading && <section className="grid gap-6 xl:grid-cols-2">
      <form onSubmit={submitInvoice} className="space-y-4 rounded-lg border bg-card p-5"><div><h2 className="font-semibold">Registrar factura</h2><p className="text-sm text-muted-foreground">Se compara automáticamente con la orden y lo recibido.</p></div><label className="block text-sm font-medium">Orden<select value={invoiceOrderId} onChange={(e) => setInvoiceOrderId(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2"><option value="">Seleccionar orden</option>{data.orders.map((order) => <option key={order.id} value={order.id}>{order.order_number}</option>)}</select></label><div className="grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Número<input required value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="text-sm font-medium">Fecha<input required type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label></div><label className="block text-sm font-medium">Impuestos<input type="number" min="0" value={taxAmount} onChange={(e) => setTaxAmount(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><div className="rounded-md bg-muted/40 p-3 text-sm"><div className="flex justify-between"><span>Neto calculado</span><strong>{currency.format(invoiceNet)}</strong></div><div className="mt-1 flex justify-between"><span>Total</span><strong>{currency.format(invoiceTotal)}</strong></div></div><button disabled={saving === 'invoice' || !invoiceOrderId} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving === 'invoice' ? 'Registrando…' : 'Registrar y comparar'}</button></form>

      <form onSubmit={submitReturn} className="space-y-4 rounded-lg border bg-card p-5"><div><h2 className="font-semibold">Crear devolución</h2><p className="text-sm text-muted-foreground">Solo aparecen recepciones con productos rechazados.</p></div><label className="block text-sm font-medium">Recepción<select value={returnReceiptId} onChange={(e) => setReturnReceiptId(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2"><option value="">Seleccionar recepción</option>{data.receipts.filter((receipt) => data.receiptLines.some((line) => line.receipt_id === receipt.id && Number(line.quantity_rejected) > 0)).map((receipt) => <option key={receipt.id} value={receipt.id}>{receipt.receipt_number}</option>)}</select></label><label className="block text-sm font-medium">Motivo<textarea required value={returnReason} onChange={(e) => setReturnReason(e.target.value)} rows={3} className="mt-1 w-full rounded-md border bg-background px-3 py-2" /></label><label className="block text-sm font-medium">Solución esperada<select value={resolutionType} onChange={(e) => setResolutionType(e.target.value)} className="mt-1 w-full rounded-md border bg-background px-3 py-2"><option value="replacement">Reposición</option><option value="credit_note">Nota de crédito</option><option value="refund">Devolución de dinero</option><option value="repair">Reparación</option></select></label><p className="rounded-md bg-muted/40 p-3 text-sm">Productos rechazados: <strong>{rejectedLines.length}</strong></p><button disabled={saving === 'return' || !returnReceiptId} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">{saving === 'return' ? 'Creando…' : 'Crear devolución'}</button></form>
    </section>}

    {!loading && <div className="grid gap-6 xl:grid-cols-2"><section className="rounded-lg border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Facturas recientes</h2></div><div className="divide-y">{data.invoices.length === 0 && <p className="p-5 text-sm text-muted-foreground">Todavía no hay facturas vinculadas.</p>}{data.invoices.slice(0, 10).map((invoice) => <div key={invoice.id} className="flex items-center justify-between p-4"><div><p className="font-medium">{invoice.invoice_number}</p><p className="text-sm text-muted-foreground">{invoice.invoice_date}</p></div><div className="text-right"><p className="font-medium">{currency.format(Number(invoice.total_amount || 0))}</p><p className="text-sm text-muted-foreground">{statusLabel[invoice.status] || invoice.status}</p></div></div>)}</div></section><section className="rounded-lg border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Devoluciones recientes</h2></div><div className="divide-y">{data.returns.length === 0 && <p className="p-5 text-sm text-muted-foreground">No existen devoluciones.</p>}{data.returns.slice(0, 10).map((item) => <div key={item.id} className="p-4"><div className="flex justify-between"><p className="font-medium">{item.return_number}</p><span className="text-sm text-muted-foreground">{statusLabel[item.status] || item.status}</span></div><p className="mt-1 text-sm text-muted-foreground">{item.reason}</p></div>)}</div></section></div>}

    {!loading && <section className="rounded-lg border bg-card"><div className="border-b p-4"><h2 className="font-semibold">Cumplimiento de proveedores</h2><p className="text-sm text-muted-foreground">Score v2 único, con cobertura visible de la evidencia de entrega.</p></div><div className="overflow-x-auto"><table className="w-full text-sm"><thead className="border-b bg-muted/30 text-left text-muted-foreground"><tr><th className="px-4 py-3">Proveedor</th><th className="px-4 py-3">Órdenes</th><th className="px-4 py-3">A tiempo</th><th className="px-4 py-3">Devoluciones</th><th className="px-4 py-3">Cobertura entrega</th><th className="px-4 py-3 text-right">Puntaje</th></tr></thead><tbody className="divide-y">{data.supplierPerformance.length === 0 && <tr><td colSpan={6} className="px-4 py-6 text-center text-muted-foreground">El puntaje aparecerá cuando existan órdenes operacionales.</td></tr>}{data.supplierPerformance.map((supplier) => <tr key={supplier.supplier_id}><td className="px-4 py-3"><p className="font-medium">{supplier.supplier_name || supplier.supplier_legal_name || 'Proveedor sin nombre'}</p><p className="text-xs text-muted-foreground">{supplier.supplier_tax_id || ''}</p></td><td className="px-4 py-3">{supplier.total_orders}</td><td className="px-4 py-3">{supplier.delivery_score == null ? 'Sin evidencia' : `${Number(supplier.delivery_score).toFixed(0)}%`}</td><td className="px-4 py-3">{supplier.returns_count}</td><td className="px-4 py-3"><span className="font-medium">{Number(supplier.delivery_scored_orders || 0)}/{Number(supplier.completed_orders || 0)}</span><span className="ml-1 text-xs text-muted-foreground">OC</span></td><td className="px-4 py-3 text-right font-semibold">{supplier.operational_score == null ? '—' : Number(supplier.operational_score).toFixed(0)}</td></tr>)}</tbody></table></div></section>}
  </main>;
}
