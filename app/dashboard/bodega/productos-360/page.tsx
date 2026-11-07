'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Boxes, Check, CircleDollarSign, ClipboardList, PackageSearch, RefreshCw, Search, ShoppingCart, Wrench, X } from 'lucide-react';
import { apiFetch } from '@/lib/api-client';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';
import { ProductPhoto } from '@/components/inventory/product-photo';
import { Button } from '@/components/ui/button';

type Media = { id: string; image_url?: string | null; status: 'pending' | 'approved' | 'rejected'; source_type: 'ai_generated' | 'web_source' };
type Product = { id: string; product_code: string; name: string; family?: string | null; subfamily?: string | null; unit?: string | null; standard_cost?: number | null; minimum_stock?: number | null; maximum_stock?: number | null; is_active: boolean; validation_status: string; media?: Media | null };
type Detail = { product: Product; media?: Media | null; canManageMedia?: boolean; summary: any; stock: any[]; snapshots: any[]; movements: any[]; workOrderUsage: any[]; maintenanceOrders: any[]; assets: any[]; purchaseLines: any[]; purchaseOrders: any[]; receipts: any[]; returns: any[]; suppliers: any[] };
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 });
const PRODUCT_BATCH_SIZE = 20;

export default function Products360Page() {
  const [q, setQ] = useState('');
  const [products, setProducts] = useState<Product[]>([]);
  const [visibleCount, setVisibleCount] = useState(PRODUCT_BATCH_SIZE);
  const [selectedId, setSelectedId] = useState('');
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [mediaBusy, setMediaBusy] = useState(false);
  const [canManageMedia, setCanManageMedia] = useState(false);
  const [importBusy, setImportBusy] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const searchRequestRef = useRef(0);

  const mediaAction = async (action: 'generate' | 'approve' | 'reject') => {
    if (!detail) return;
    setMediaBusy(true); setError('');
    try {
      const response = await apiFetch('/api/admin/product-media', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action, productId: detail.product.id, mediaId: detail.media?.id }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo gestionar la fotografía.');
      await loadDetail(detail.product.id);
      await search(q);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo gestionar la fotografía.'); }
    finally { setMediaBusy(false); }
  };

  const search = useCallback(async (term = '') => {
    const requestId = ++searchRequestRef.current;
    const normalizedTerm = term.trim();
    if (!normalizedTerm) {
      setProducts([]);
      setVisibleCount(PRODUCT_BATCH_SIZE);
      return;
    }
    const response = await apiFetch(`/api/inventory/products-360?q=${encodeURIComponent(normalizedTerm)}`);
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.error || 'No se pudieron cargar los productos.');
    if (requestId !== searchRequestRef.current) return;
    setProducts(payload.products || []);
    setVisibleCount(PRODUCT_BATCH_SIZE);
    setCanManageMedia(Boolean(payload.canManageMedia));
  }, []);

  const importWebBatch = async () => {
    setImportBusy(true); setError(''); setImportMessage('');
    let processed = 0; let imported = 0; let failed = 0;
    try {
      for (let batch = 0; batch < 10; batch += 1) {
        const response = await apiFetch('/api/cron/product-media-web-import', { method: 'POST' });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'No se pudo procesar la cola web.');
        processed += Number(payload?.processed || 0);
        imported += Number(payload?.imported || 0);
        failed += Number(payload?.failed || 0);
        if (!payload?.processed) break;
      }
      setImportMessage(`Procesados ${processed} · Importados ${imported} · Fallidos ${failed}`);
      await search(q);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo procesar la cola web.'); }
    finally { setImportBusy(false); }
  };

  const loadDetail = useCallback(async (id: string) => {
    setLoading(true); setError('');
    try {
      const response = await apiFetch(`/api/inventory/products-360?productId=${id}`);
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || 'No se pudo cargar la ficha.');
      setDetail(payload);
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'No se pudo cargar la ficha.'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => {
    const normalizedTerm = q.trim();
    searchRequestRef.current += 1;
    setProducts([]);
    setVisibleCount(PRODUCT_BATCH_SIZE);
    if (!normalizedTerm) return;

    const timeout = window.setTimeout(() => {
      search(normalizedTerm).catch((cause) => setError(cause instanceof Error ? cause.message : 'Error de búsqueda.'));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [q, search]);

  useEffect(() => { if (selectedId) loadDetail(selectedId); }, [selectedId, loadDetail]);

  const relations = useMemo(() => {
    if (!detail) return { orders: new Map(), workOrders: new Map(), assets: new Map() };
    return {
      orders: new Map(detail.purchaseOrders.map((row) => [row.id, row])),
      workOrders: new Map(detail.maintenanceOrders.map((row) => [row.id, row])),
      assets: new Map(detail.assets.map((row) => [row.id, row])),
    };
  }, [detail]);

  const visibleProducts = useMemo(() => products.slice(0, visibleCount), [products, visibleCount]);
  const hasMoreProducts = visibleCount < products.length;

  const cards = detail ? [
    { label: 'Existencia', value: Number(detail.summary.quantity_on_hand || 0).toLocaleString('es-CL'), Icon: Boxes },
    { label: 'Disponible', value: Number(detail.summary.quantity_available || 0).toLocaleString('es-CL'), Icon: PackageSearch },
    { label: 'Reservado', value: Number(detail.summary.quantity_reserved || 0).toLocaleString('es-CL'), Icon: ClipboardList },
    { label: 'Valor inventario', value: money.format(Number(detail.summary.inventory_value || 0)), Icon: CircleDollarSign },
    { label: 'Proveedores', value: detail.suppliers.length, Icon: ShoppingCart },
    { label: 'Órdenes de trabajo', value: detail.workOrderUsage.length, Icon: Wrench },
  ] : [];

  return <main className="space-y-6">
    <header className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Bodega</p><h1 className="mt-1 text-2xl font-semibold">Producto 360°</h1><p className="mt-1 text-sm text-muted-foreground">Stock, lotes, movimientos, compras, proveedores, consumo, equipos y costos en una sola ficha.</p></div>{canManageMedia ? <div className="text-right"><Button variant="outline" onClick={() => void importWebBatch()} disabled={importBusy}><RefreshCw className={`mr-2 h-4 w-4 ${importBusy ? 'animate-spin' : ''}`}/>{importBusy ? 'Procesando fuentes…' : 'Procesar fuentes web'}</Button>{importMessage ? <p className="mt-2 text-xs text-muted-foreground">{importMessage}</p> : null}</div> : null}</header>
    <section className="grid gap-6 lg:grid-cols-[340px_1fr]">
      <aside className="rounded-lg border bg-card">
        <form onSubmit={(e) => { e.preventDefault(); search(q).catch((cause) => setError(cause.message)); }} className="flex gap-2 border-b p-3"><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Código, nombre o familia" className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"/><button className="rounded-md border px-3" aria-label="Buscar"><Search className="h-4 w-4"/></button></form>
        <div
          className="max-h-[70vh] divide-y overflow-y-auto"
          onScroll={(event) => {
            if (!hasMoreProducts) return;
            const target = event.currentTarget;
            if (target.scrollHeight - target.scrollTop - target.clientHeight < 180) {
              setVisibleCount((count) => Math.min(count + PRODUCT_BATCH_SIZE, products.length));
            }
          }}
        >
          {!products.length ? <div className="p-6 text-center text-xs text-muted-foreground">{q.trim() ? 'Buscando productos…' : 'Escribe un código, nombre o familia para buscar.'}</div> : null}
          {visibleProducts.map((product) => <button key={product.id} onClick={() => setSelectedId(product.id)} className={`flex w-full items-center gap-3 p-3 text-left text-sm hover:bg-muted ${selectedId === product.id ? 'bg-muted' : ''}`}><ProductPhoto media={product.media} name={product.name} size="sm"/><span><span className="block font-medium">{product.name}</span><span className="text-xs text-muted-foreground">{product.product_code} · {product.media?.status === 'approved' ? 'Foto validada' : 'Foto pendiente'}</span></span></button>)}
          {hasMoreProducts ? <div className="p-3 text-center text-xs text-muted-foreground">Desplázate para cargar 20 más</div> : null}
        </div>
      </aside>
      <div className="space-y-5">
        {!selectedId && <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">Selecciona un producto para abrir su trazabilidad completa.</div>}
        {loading && <div className="rounded-lg border p-6 text-sm text-muted-foreground">Cargando ficha…</div>}
        {error && <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">{error}</div>}
        {detail && !loading && <>
          <section className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-start justify-between gap-4"><div className="flex gap-4"><ProductPhoto media={detail.media} name={detail.product.name} size="lg" showPending={Boolean(detail.canManageMedia)}/><div><h2 className="text-xl font-semibold">{detail.product.name}</h2><p className="text-sm text-muted-foreground">{detail.product.product_code} · {detail.product.family || 'Sin familia'}{detail.product.subfamily ? ` / ${detail.product.subfamily}` : ''}</p><p className="mt-2 text-xs text-muted-foreground">{detail.media?.status === 'approved' ? (detail.media.source_type === 'web_source' ? 'Foto de fuente web validada' : 'Imagen generada por IA y validada') : detail.media?.status === 'pending' ? (detail.media.source_type === 'web_source' ? 'Foto web pendiente de validación' : 'Imagen IA pendiente de validación') : 'Foto pendiente'}</p>{detail.canManageMedia ? <div className="mt-3 flex flex-wrap gap-2">{detail.media?.status === 'pending' ? <><Button size="sm" onClick={() => void mediaAction('approve')} disabled={mediaBusy}><Check className="mr-2 h-4 w-4"/>Aprobar</Button><Button size="sm" variant="outline" onClick={() => void mediaAction('reject')} disabled={mediaBusy}><X className="mr-2 h-4 w-4"/>Rechazar</Button></> : null}<Button size="sm" variant="outline" onClick={() => void mediaAction('generate')} disabled={mediaBusy}><RefreshCw className={`mr-2 h-4 w-4 ${mediaBusy ? 'animate-spin' : ''}`}/>{detail.media ? 'Generar reemplazo' : 'Generar foto IA'}</Button></div> : null}</div></div><div className="text-right text-sm"><p>Unidad: {detail.product.unit || 'No informada'}</p><p>Costo estándar: {money.format(Number(detail.product.standard_cost || 0))}</p><p>Estado: {detail.product.is_active ? 'Activo' : 'Inactivo'}</p></div></div></section>
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">{cards.map(({ label, value, Icon }) => <article key={label} className="rounded-lg border bg-card p-4"><div className="flex justify-between text-muted-foreground"><span className="text-xs">{label}</span><Icon className="h-4 w-4"/></div><p className="mt-2 text-xl font-semibold">{value}</p></article>)}</section>
          {(detail.summary.expiring_lots > 0 || isStockBelowMinimum(detail.summary.quantity_available, detail.product.minimum_stock)) && <div className="space-y-2">{detail.summary.expiring_lots > 0 && <p className="rounded-lg border border-amber-500/40 bg-amber-500/5 p-4 text-sm">{detail.summary.expiring_lots} lote(s) vencen dentro de los próximos 90 días.</p>}{isStockBelowMinimum(detail.summary.quantity_available, detail.product.minimum_stock) && <p className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive">La disponibilidad está en o bajo el stock mínimo definido.</p>}</div>}
          <section className="grid gap-5 xl:grid-cols-2">
            <Panel title="Existencias, lotes y vencimientos" empty="No hay existencias vinculadas al producto.">{detail.stock.slice(0, 15).map((row: any) => <Row key={row.id} title={`${row.part_code || detail.product.product_code} · ${row.batch_number || 'Sin lote'}`} meta={`Disponible ${Number(row.quantity_available || 0)} · Vence ${row.expiry_date || 'sin fecha'}`} value={money.format(Number(row.quantity_on_hand || 0) * Number(row.unit_cost || 0))}/>)}</Panel>
            <Panel title="Proveedores y precios históricos" empty="No hay compras con proveedores identificados.">{detail.suppliers.slice(0, 15).map((row: any, index: number) => <Row key={`${row.supplier_id || row.supplier_tax_id}-${index}`} title={row.supplier_name} meta={`${row.purchases} compra(s) · ${row.last_order_date || 'sin fecha'}`} value={`${money.format(Number(row.min_unit_cost || 0))} — ${money.format(Number(row.max_unit_cost || 0))}`}/>)}</Panel>
            <Panel title="Compras y recepciones" empty="No hay compras relacionadas.">{detail.purchaseLines.slice(0, 15).map((line: any) => { const order: any = relations.orders.get(line.purchase_order_id); return <Row key={line.id} title={line.order_number || order?.order_number || 'Orden'} meta={`${order?.supplier_name || 'Proveedor no identificado'} · Recibido ${Number(line.quantity_received || 0)}/${Number(line.quantity || 0)}`} value={money.format(Number(line.net_amount || 0))}/>; })}</Panel>
            <Panel title="Consumo en mantenimiento" empty="No hay consumo en órdenes de trabajo.">{detail.workOrderUsage.slice(0, 15).map((row: any) => { const workOrder: any = relations.workOrders.get(row.work_order_id); const asset: any = relations.assets.get(row.canonical_asset_id); return <Row key={row.id} title={workOrder?.work_order_number || 'Orden de trabajo'} meta={`${asset?.asset_code || 'Sin equipo'} · Instalado ${Number(row.quantity_installed || 0)} · Devuelto ${Number(row.quantity_returned || 0)}`} value={money.format(Number(row.total_cost || 0))}/>; })}</Panel>
          </section>
          <Panel title="Movimientos recientes" empty="No hay movimientos relacionados.">{detail.movements.slice(0, 20).map((row: any) => <Row key={row.id} title={row.movement_type} meta={`${new Date(row.created_at).toLocaleString('es-CL')} · ${row.reason || row.reference_doc || 'Sin referencia'}`} value={`${Number(row.quantity || 0)} ${detail.product.unit || ''}`}/>)}</Panel>
        </>}
      </div>
    </section>
  </main>;
}

function Panel({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) { const count = Array.isArray(children) ? children.length : 1; return <section className="rounded-lg border bg-card"><div className="border-b p-4"><h3 className="font-semibold">{title}</h3></div><div className="divide-y">{count ? children : <p className="p-5 text-sm text-muted-foreground">{empty}</p>}</div></section>; }
function Row({ title, meta, value }: { title: string; meta: string; value: string }) { return <div className="flex items-start justify-between gap-4 p-4"><div><p className="font-medium">{title}</p><p className="text-xs text-muted-foreground">{meta}</p></div><span className="shrink-0 text-sm">{value}</span></div>; }
