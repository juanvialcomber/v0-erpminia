'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import useSWR from 'swr';
import { ArrowLeft, Boxes, Building2, CalendarClock, CircleDollarSign, Factory, PackageCheck, ShoppingCart, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el producto');
  return payload;
};

const number = (value: unknown) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value || 0));
const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const date = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium' }).format(new Date(String(value))) : 'Sin fecha';

type PurchaseOrder = { id: string; order_number: string; order_date?: string | null; supplier_name?: string | null; supplier_tax_id?: string | null; total_amount?: number | null; operational_status?: string | null; status?: string | null };
type Purchase = { id: number; quantity?: number | null; quantity_received?: number | null; unit?: string | null; unit_cost?: number | null; net_amount?: number | null; purchase_order?: PurchaseOrder | null };
type Receipt = { id: string; quantity_received: number; quantity_accepted: number; quantity_rejected: number; batch_number?: string | null; expiry_date?: string | null; receipt?: { receipt_number: string; received_at: string; warehouse_code?: string | null; status: string } | null };
type Movement = { id: string; movement_type: string; quantity: number; created_at: string; reason?: string | null; unit_cost?: number | null; total_cost?: number | null; work_order?: { work_order_number: string; title: string } | null; asset?: { asset_code: string; name: string } | null };
type Usage = { id: string; quantity_issued: number; quantity_installed: number; quantity_returned: number; total_cost?: number | null; status: string; created_at: string; work_order?: { id: string; work_order_number: string; title: string; status: string } | null; asset?: { id: string; asset_code: string; name: string } | null };

export default function ProductTraceabilityPage() {
  const params = useParams<{ id: string }>();
  const { data, error, isLoading } = useSWR(params.id ? `/api/inventory/products/${params.id}` : null, fetcher);

  if (isLoading) return <div className="rounded-lg border p-8 text-sm text-muted-foreground">Cargando expediente del producto...</div>;
  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>;
  if (!data?.product) return <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Producto no encontrado.</div>;

  const product = data.product;
  const trace = data.traceability || {};
  const inventory = data.inventory || {};
  const purchases: Purchase[] = data.purchases || [];
  const receipts: Receipt[] = data.receipts || [];
  const movements: Movement[] = data.movements || [];
  const usage: Usage[] = data.maintenanceUsage || [];
  const suppliers: PurchaseOrder[] = data.suppliers || [];
  const assets = data.assets || [];
  const laudus = data.laudusIntelligence || null;
  const laudusData = laudus?.laudus || null;
  const laudusMaintenance = laudus?.maintenance || null;
  const primarySignal = String(laudus?.interpretation?.primary_signal || 'no_laudus_history');
  const signalCopy: Record<string, { title: string; detail: string; action: string }> = {
    active_maintenance_shortage: {
      title: 'Faltante ligado a mantenimiento activo',
      detail: 'La demanda registrada por OT supera la disponibilidad actual.',
      action: 'Revisar cobertura, compra pendiente y fecha requerida antes de ejecutar la OT.',
    },
    negative_stock: {
      title: 'Saldo negativo por conciliar',
      detail: 'El saldo operativo no es confiable para decidir reposición hasta revisar movimientos y conteo.',
      action: 'Conciliar stock antes de comprar o comprometer disponibilidad.',
    },
    price_above_50pct: {
      title: 'Precio reciente muy sobre la referencia observada',
      detail: 'La última compra Laudus supera en al menos 50% la mediana observada para el mismo SKU.',
      action: 'Validar unidad, especificación y cotización antes de reponer.',
    },
    price_above_20pct: {
      title: 'Precio reciente sobre la referencia observada',
      detail: 'La última compra Laudus supera en al menos 20% la mediana observada para el mismo SKU.',
      action: 'Comparar proveedor y condición comercial antes de una nueva compra.',
    },
    single_supplier: {
      title: 'Una sola fuente observada',
      detail: 'El historial Laudus muestra compras recurrentes concentradas en un proveedor.',
      action: 'Evaluar alternativa sólo si el producto es recurrente o relevante para operación.',
    },
    generic_sku_history_only: {
      title: 'SKU genérico: usar sólo como contexto',
      detail: 'Este código agrupa compras heterogéneas. MOTIL conserva historial y proveedores, pero desactiva comparaciones de precio.',
      action: 'No usar este SKU para concluir variación de precio; resolver productos específicos cuando corresponda.',
    },
    purchase_history_available: {
      title: 'Historial Laudus disponible',
      detail: 'MOTIL puede contextualizar proveedores, frecuencia y precio observado para este producto.',
      action: 'Usar la evidencia como referencia antes de una nueva compra.',
    },
    no_laudus_history: {
      title: 'Sin historial Laudus suficiente',
      detail: 'No existe evidencia Laudus comparable para este SKU en la ventana actual.',
      action: 'Mantener la decisión basada en inventario y evidencia operacional disponible.',
    },
  };
  const signal = signalCopy[primarySignal] || signalCopy.no_laudus_history;

  return (
    <div className="space-y-6">
      <section className="border-b border-border/70 pb-6">
        <Button asChild variant="ghost" size="sm" className="mb-4 -ml-3">
          <Link href="/dashboard/bodega"><ArrowLeft className="mr-2 h-4 w-4" />Volver al inventario</Link>
        </Button>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-mono text-sm text-muted-foreground">{product.product_code}</p>
              <Badge variant={inventory.stock_status === 'healthy' ? 'secondary' : 'outline'}>{inventory.stock_status || product.validation_status}</Badge>
            </div>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-2 max-w-3xl text-sm text-muted-foreground">{product.description || 'Expediente canónico de inventario, compras, recepciones y consumo en mantenimiento.'}</p>
          </div>
          <div className="text-left lg:text-right">
            <p className="text-sm text-muted-foreground">Costo unitario actual</p>
            <p className="mt-1 text-2xl font-semibold">{money(trace.current_unit_cost || inventory.unit_cost || product.standard_cost)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Promedio histórico {money(trace.weighted_average_unit_cost)}</p>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">MOTIL Intelligence · Producto 360</p>
          <div className="mt-1 flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{signal.title}</h2>
              <p className="mt-1 max-w-3xl text-sm text-muted-foreground">{signal.detail}</p>
            </div>
            <Badge variant={laudus?.interpretation?.priority === 'high' ? 'destructive' : 'outline'}>
              {laudusData?.matched ? 'Evidencia Laudus' : 'Sin vínculo Laudus'}
            </Badge>
          </div>
          <p className="mt-3 text-sm"><span className="font-medium">Siguiente decisión:</span> {signal.action}</p>
        </div>

        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Compras Laudus · 365 días</p>
            <p className="mt-1 text-xl font-semibold">{number(laudusData?.purchase_lines)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Última: {date(laudusData?.last_purchase_at)}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Proveedores observados</p>
            <p className="mt-1 text-xl font-semibold">{number(laudusData?.supplier_count)}</p>
            <p className="mt-1 text-xs text-muted-foreground">{laudusData?.top_supplier_share ? `Principal: ${Math.round(Number(laudusData.top_supplier_share) * 100)}%` : 'Sin concentración calculable'}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Precio reciente</p>
            <p className="mt-1 text-xl font-semibold">{laudusData?.price_comparable ? money(laudusData.latest_unit_price) : 'No comparable'}</p>
            <p className="mt-1 text-xs text-muted-foreground">{laudusData?.price_comparable && laudusData?.median_unit_price != null ? `Mediana ${money(laudusData.median_unit_price)}` : 'SKU genérico o evidencia insuficiente'}</p>
          </div>
          <div className="bg-card p-4">
            <p className="text-xs text-muted-foreground">Demanda mantenimiento</p>
            <p className="mt-1 text-xl font-semibold">{number(laudusMaintenance?.active_work_orders)} OT</p>
            <p className="mt-1 text-xs text-muted-foreground">{Number(laudusMaintenance?.active_shortage_qty || 0) > 0 ? `Faltante: ${number(laudusMaintenance.active_shortage_qty)}` : 'Sin faltante activo identificado'}</p>
          </div>
        </div>

        {Array.isArray(laudusData?.suppliers) && laudusData.suppliers.length ? <div className="border-t p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">Principales proveedores Laudus</p>
          <div className="mt-3 grid gap-3 lg:grid-cols-2">
            {laudusData.suppliers.slice(0, 4).map((supplier: any) => (
              <div key={supplier.supplier_tax_id} className="flex items-start justify-between gap-4 rounded-md border p-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium">{supplier.supplier_name || supplier.supplier_tax_id}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{supplier.line_count} líneas observadas</p>
                </div>
                <span className="shrink-0 text-sm">{supplier.share != null ? `${Math.round(Number(supplier.share) * 100)}%` : '—'}</span>
              </div>
            ))}
          </div>
        </div> : null}

        <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
          Laudus aporta historial de compra; no equivale a consumo físico. MOTIL no repone stock ni modifica Laudus desde esta vista.
        </div>
      </section>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Disponible" value={`${number(inventory.quantity_available)} ${product.unit || ''}`} icon={Boxes} />
        <Metric label="Comprado históricamente" value={number(trace.total_quantity_purchased)} icon={ShoppingCart} />
        <Metric label="Gasto acumulado" value={money(trace.total_spend)} icon={CircleDollarSign} />
        <Metric label="Activos asociados" value={number(trace.assets_consumed_in || assets.length)} icon={Factory} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.15fr)_minmax(360px,0.85fr)]">
        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Posición actual</CardTitle><CardDescription>La existencia operativa proviene de una sola posición canónica.</CardDescription></CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Datum label="En mano" value={number(inventory.quantity_on_hand)} />
              <Datum label="Reservado" value={number(inventory.quantity_reserved)} />
              <Datum label="Punto reposición" value={number(inventory.reorder_level)} />
              <Datum label="Valor en stock" value={money(inventory.stock_value)} />
              <Datum label="Familia" value={product.family || 'Sin familia'} />
              <Datum label="Subfamilia" value={product.subfamily || 'Sin subfamilia'} />
              <Datum label="Último conteo" value={date(inventory.last_counted_date)} />
              <Datum label="Vencimiento" value={date(inventory.expiry_date)} />
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Compras y proveedores</CardTitle><CardDescription>Historial de precio, cantidades y proveedor desde las líneas canónicas de OC.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {!purchases.length ? <Empty text="Este producto no registra compras." /> : purchases.slice(0, 30).map((row) => (
                <div key={row.id} className="grid gap-3 rounded-lg border p-4 md:grid-cols-[1fr_150px_150px] md:items-center">
                  <div>
                    <p className="font-medium">{row.purchase_order?.order_number || 'Orden sin folio'}</p>
                    <p className="mt-1 text-sm text-muted-foreground">{row.purchase_order?.supplier_name || 'Proveedor no identificado'} · {date(row.purchase_order?.order_date)}</p>
                  </div>
                  <div><p className="text-xs text-muted-foreground">Cantidad</p><p className="text-sm font-medium">{number(row.quantity)} {row.unit || product.unit || ''}</p></div>
                  <div><p className="text-xs text-muted-foreground">Costo unitario</p><p className="text-sm font-medium">{money(row.unit_cost)}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Uso en mantenimiento</CardTitle><CardDescription>Repuestos entregados, instalados o devueltos, ligados a la OT y al activo.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {!usage.length ? <Empty text="Todavía no existen consumos trazados en órdenes de trabajo." /> : usage.map((row) => (
                <div key={row.id} className="flex flex-col gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="flex flex-wrap items-center gap-2"><p className="font-medium">{row.work_order?.work_order_number || 'OT'}</p><Badge variant="outline">{row.status}</Badge></div>
                    <p className="mt-1 text-sm text-muted-foreground">{row.asset ? `${row.asset.asset_code} · ${row.asset.name}` : 'Activo no identificado'}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{row.work_order?.title || 'Intervención'} · {date(row.created_at)}</p>
                  </div>
                  <div className="text-sm sm:text-right"><p>Instalado: <strong>{number(row.quantity_installed)}</strong></p><p className="text-muted-foreground">Costo {money(row.total_cost)}</p></div>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card className="shadow-none">
            <CardHeader><CardTitle>Resumen de trazabilidad</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <SummaryRow icon={ShoppingCart} label="Órdenes de compra" value={number(trace.purchase_order_count)} />
              <SummaryRow icon={Building2} label="Proveedores" value={number(trace.supplier_count || suppliers.length)} />
              <SummaryRow icon={PackageCheck} label="Recepciones" value={number(receipts.length)} />
              <SummaryRow icon={Wrench} label="OT con consumo" value={number(trace.work_orders_consumed_in)} />
              <SummaryRow icon={CalendarClock} label="Última compra" value={date(trace.last_purchase_date)} />
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Recepciones</CardTitle><CardDescription>Solo las cantidades aceptadas ingresan a stock.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {!receipts.length ? <Empty text="No hay recepciones operativas registradas." /> : receipts.map((row) => (
                <div key={row.id} className="rounded-lg border p-4">
                  <div className="flex items-center justify-between gap-3"><p className="font-medium">{row.receipt?.receipt_number || 'Recepción'}</p><Badge variant="outline">{row.receipt?.status || 'received'}</Badge></div>
                  <p className="mt-2 text-sm text-muted-foreground">Aceptado {number(row.quantity_accepted)} · rechazado {number(row.quantity_rejected)}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{date(row.receipt?.received_at)}{row.batch_number ? ` · lote ${row.batch_number}` : ''}</p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="shadow-none">
            <CardHeader><CardTitle>Últimos movimientos</CardTitle><CardDescription>Kardex operativo generado por recepciones y consumos.</CardDescription></CardHeader>
            <CardContent className="space-y-3">
              {!movements.length ? <Empty text="No existen movimientos transaccionales todavía." /> : movements.slice(0, 30).map((row) => (
                <div key={row.id} className="border-l-2 border-border pl-4">
                  <div className="flex items-center justify-between gap-3"><p className="text-sm font-medium">{row.movement_type}</p><p className="text-sm font-semibold">{number(row.quantity)}</p></div>
                  <p className="mt-1 text-xs text-muted-foreground">{row.reason || row.work_order?.work_order_number || 'Movimiento de inventario'} · {date(row.created_at)}</p>
                  {row.asset ? <p className="mt-1 text-xs text-muted-foreground">{row.asset.asset_code} · {row.asset.name}</p> : null}
                </div>
              ))}
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, icon: Icon }: { label: string; value: string; icon: typeof Boxes }) {
  return <Card className="shadow-none"><CardContent className="flex items-center justify-between p-5"><div><p className="text-sm text-muted-foreground">{label}</p><p className="mt-1 text-2xl font-semibold">{value}</p></div><Icon className="h-5 w-5 text-muted-foreground" /></CardContent></Card>;
}
function Datum({ label, value }: { label: string; value: string }) {
  return <div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p><p className="mt-1 text-sm font-medium">{value}</p></div>;
}
function SummaryRow({ icon: Icon, label, value }: { icon: typeof Boxes; label: string; value: string }) {
  return <div className="flex items-center justify-between gap-4"><div className="flex items-center gap-3"><Icon className="h-4 w-4 text-muted-foreground" /><span className="text-sm">{label}</span></div><span className="text-sm font-semibold">{value}</span></div>;
}
function Empty({ text }: { text: string }) {
  return <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">{text}</p>;
}
