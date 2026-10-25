'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, CalendarDays, FileWarning, Package, ReceiptText } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CertifiedFinancialSummary } from '@/components/finance/certified-financial-summary';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error('No fue posible cargar la ficha del proveedor. Inténtalo de nuevo.');
  return payload;
};

const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value: unknown) => new Intl.NumberFormat('es-CL').format(Number(value || 0));

function statusLabel(value: string | null | undefined) {
  if (!value) return 'Sin estado';
  const labels: Record<string, string> = {
    approved: 'Aprobada', accepted: 'Aceptada', awarded: 'Adjudicada',
    pending: 'Pendiente', draft: 'Borrador', sent: 'Enviada',
    completed: 'Completada', closed: 'Cerrada', cancelled: 'Anulada', canceled: 'Anulada',
    rejected: 'Rechazada', received: 'Recibida', partially_received: 'Recibida parcialmente',
    valid: 'Datos revisados', verified: 'Datos confirmados', warning: 'Requieren revisión',
    invalid: 'Requieren corrección', incomplete: 'Faltan datos',
  };
  return labels[value.toLowerCase()] || (value.includes('_') ? 'En revisión' : value);
}

type PurchaseOrder = { id: string; order_number: string; order_date?: string | null; total_amount?: number | null; operational_status?: string | null; status?: string | null };
type ProductSummary = { product_code: string; description?: string | null; quantity: number; spend: number };
type Quotation = { id: string; quotation_number: string; quotation_date?: string | null; total_amount?: number | null; status?: string | null; lead_time_days?: number | null };

export default function SupplierProfilePage() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR(params.id ? `/api/finance/suppliers/${params.id}` : null, fetcher);
  const supplier = data?.supplier;
  const performance = data?.performance;
  const orders: PurchaseOrder[] = data?.purchaseOrders || [];
  const products: ProductSummary[] = data?.topProducts || [];
  const quotations: Quotation[] = data?.quotations || [];

  if (isLoading) return <p className="p-6 text-sm text-muted-foreground">Cargando proveedor...</p>;
  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>;
  if (!supplier) return null;

  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3"><Link href="/dashboard/finanzas/proveedores"><ArrowLeft className="mr-2 h-4 w-4" />Proveedores</Link></Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div><p className="text-sm font-medium text-muted-foreground">Ficha del proveedor</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">{supplier.trade_name || supplier.legal_name}</h1><p className="mt-2 text-sm text-muted-foreground">{supplier.tax_id || 'Sin RUT'} · {supplier.region || 'Sin región'} · {supplier.country || 'Chile'}</p></div>
          <Badge variant={supplier.is_active ? 'secondary' : 'outline'}>{supplier.is_active ? 'Activo' : 'Inactivo'}</Badge>
        </div>
      </section>

      <CertifiedFinancialSummary entity="supplier" id={params.id} />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Órdenes de compra" value={number(performance?.purchase_order_count)} icon={ReceiptText} />
        <Metric label="Productos suministrados" value={number(performance?.distinct_product_count)} icon={Package} />
        <Metric label="Última compra" value={performance?.last_purchase_date || 'Sin compras'} icon={CalendarDays} />
        <Metric label="Órdenes con observaciones" value={number(performance?.warning_order_count)} icon={FileWarning} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
        <Card className="shadow-none"><CardHeader><CardTitle>Datos del proveedor</CardTitle><CardDescription>Información de contacto y pago.</CardDescription></CardHeader><CardContent className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Razón social" value={supplier.legal_name} /><Field label="Nombre comercial" value={supplier.trade_name} /><Field label="Actividad" value={supplier.business_activity} /><Field label="Condición de pago" value={supplier.payment_terms} /><Field label="Correo electrónico" value={supplier.email} /><Field label="Teléfono" value={supplier.phone} /><Field label="Dirección" value={[supplier.address, supplier.commune].filter(Boolean).join(', ')} /><Field label="Estado de los datos" value={statusLabel(supplier.validation_status)} />
        </CardContent></Card>

        <Card className="shadow-none"><CardHeader><CardTitle>Productos principales</CardTitle><CardDescription>Los productos que más se han comprado a este proveedor.</CardDescription></CardHeader><CardContent className="space-y-3">
          {!products.length ? <p className="text-sm text-muted-foreground">No hay compras anteriores asociadas a productos.</p> : products.map((product) => <div key={`${product.product_code}-${product.description}`} className="grid gap-2 border-b pb-3 last:border-0 sm:grid-cols-[1fr_120px_160px] sm:items-center"><div><p className="font-medium">{product.product_code}</p><p className="text-xs text-muted-foreground">{product.description || 'Sin descripción'}</p></div><p className="text-sm">{number(product.quantity)} unidades</p><p className="text-sm font-medium">{money(product.spend)}</p></div>)}
        </CardContent></Card>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card className="shadow-none"><CardHeader><CardTitle>Órdenes recientes</CardTitle></CardHeader><CardContent className="space-y-3">
          {!orders.length ? <p className="text-sm text-muted-foreground">No hay órdenes de compra para mostrar.</p> : orders.slice(0, 20).map((order) => <div key={order.id} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0"><div><p className="font-medium">{order.order_number}</p><p className="text-xs text-muted-foreground">{order.order_date || 'Sin fecha'} · {statusLabel(order.operational_status || order.status)}</p></div><p className="text-sm font-medium">{money(order.total_amount)}</p></div>)}
        </CardContent></Card>

        <Card className="shadow-none"><CardHeader><CardTitle>Cotizaciones</CardTitle></CardHeader><CardContent className="space-y-3">
          {!quotations.length ? <p className="text-sm text-muted-foreground">No hay cotizaciones registradas.</p> : quotations.slice(0, 20).map((quotation) => <div key={quotation.id} className="flex items-center justify-between gap-4 border-b pb-3 last:border-0"><div><p className="font-medium">{quotation.quotation_number}</p><p className="text-xs text-muted-foreground">{quotation.quotation_date || 'Sin fecha'} · plazo de {quotation.lead_time_days || 0} días · {statusLabel(quotation.status)}</p></div><p className="text-sm font-medium">{money(quotation.total_amount)}</p></div>)}
        </CardContent></Card>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof ReceiptText }) {
  return <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold">{value}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>;
}

function Field({ label, value }: { label: string; value?: string | null }) {
  return <div><p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 font-medium">{value || 'No informado'}</p></div>;
}
