'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AlertTriangle, ArrowRight, Boxes, Fuel, PackageCheck, Search, ShieldAlert, Upload } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';
import { useModuleAccess } from '@/hooks/use-module-access';
import { DataSourceStatusStrip } from '@/components/data/data-source-status-strip';
import { DataReceptionReadiness } from '@/components/data/data-reception-readiness';
import { useDataSourceStatus } from '@/hooks/use-data-source-status';
import { LaudusInventoryReadinessCard } from '@/components/integrations/laudus-inventory-readiness-card';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar el inventario.');
  return payload;
};

const number = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-CL').format(value) : '—';
const money = (value: unknown) => typeof value === 'number' && Number.isFinite(value) ? new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value) : '—';
const dateTime = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(String(value))) : 'Sin fecha';
const dateOnly = (value: unknown) => value ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${String(value).slice(0, 10)}T00:00:00Z`)) : 'Sin evidencia';
const statusLabels: Record<string, string> = { healthy: 'Disponible', reorder: 'Reponer', out_of_stock: 'Sin stock', negative: 'Revisar saldo', expired: 'Vencido', expiring: 'Próximo a vencer' };
function statusVariant(status: string) { if (['out_of_stock', 'negative', 'expired'].includes(status)) return 'destructive' as const; if (['reorder', 'expiring'].includes(status)) return 'secondary' as const; return 'outline' as const; }

type InventoryPosition = { stock_id: string; product_id: string; product_code: string; product_name: string; family?: string | null; unit?: string | null; quantity_available: number; quantity_reserved: number; stock_value: number; stock_status: string; last_counted_date?: string | null; warehouse_code?: string | null; laudus_stock?: number | null; laudus_synced_at?: string | null; laudus_source_date_to?: string | null; laudus_quantity_delta?: number | null; laudus_reconciliation_state?: string | null; laudus_stock_position_count?: number | null; effective_quantity?: number | null; effective_source?: 'laudus' | 'motil'; source_authority_state?: string | null; };
type DieselCurrent = InventoryPosition & { unit_cost?: number | null; validation_status?: string | null; };
type DieselLaudus = { sku: string; description?: string | null; unit_of_measure?: string | null; laudus_stock: number | null; laudus_synced_at?: string | null; source_date_to?: string | null; motil_stock?: number | null; motil_unit_cost?: number | null; motil_updated_at?: string | null; quantity_delta?: number | null; reconciliation_state?: string | null; stock_position_count?: number | null; };
type DieselEvidence = { current: DieselCurrent | null; laudus: DieselLaudus | null; hasConflict: boolean; sourcesDiffer?: boolean; effectiveQuantity?: number | null; effectiveSource?: 'laudus' | 'motil' };

export default function BodegaPage() {
  const { canEdit, ready } = useModuleAccess();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') || 'all';
  const dataHealth = searchParams.get('dataHealth');
  const negativeStockMode = dataHealth === 'negative_stock' || initialStatus === 'negative';
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState(initialStatus);
  const endpoint = useMemo(() => { const params = new URLSearchParams(); if (query.trim()) params.set('q', query.trim()); if (status !== 'all') params.set('status', status); return `/api/inventory/intelligence?${params.toString()}`; }, [query, status]);
  const { data, error, isLoading, mutate } = useSWR(endpoint, fetcher, { revalidateOnFocus: false, keepPreviousData: true });
  const sourceStatus = useDataSourceStatus();
  const overview = error ? {} : data?.overview || {};
  const positions: InventoryPosition[] = error ? [] : data?.positions || [];
  const diesel: DieselEvidence | null = error ? null : data?.diesel || null;
  const dieselCurrent = diesel?.current || null;
  const dieselLaudus = diesel?.laudus || null;
  const sourceAuthority = error ? null : data?.sourceAuthority || null;
  const valuationTrusted = Boolean(sourceAuthority?.laudusIsPrimary) && !diesel?.hasConflict;

  const attention = [
    { label: 'Saldos negativos', value: overview.negative_stock_products, detail: 'Requieren conciliación antes de usar disponibilidad.', href: '/dashboard/bodega?status=negative', critical: true },
    { label: 'Sin stock', value: overview.out_of_stock_products, detail: 'Productos sin disponibilidad registrada.', href: '/dashboard/bodega?status=out_of_stock', critical: false },
    { label: 'Por reponer', value: overview.reorder_products, detail: 'Posiciones bajo el mínimo registrado.', href: '/dashboard/bodega?status=reorder', critical: false },
  ];

  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Abastecimiento</PageHeaderEyebrow>
        <PageHeaderTitle>{negativeStockMode ? 'Conciliar stock negativo' : 'Bodega'}</PageHeaderTitle>
        <PageHeaderDescription>{negativeStockMode ? 'Revisa únicamente posiciones con saldo negativo antes de usar disponibilidad, reposición o cobertura para decidir.' : 'Qué existe, qué falta y qué requiere conciliación antes de comprometer mantenimiento o compras.'}</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        {negativeStockMode ? <Button asChild variant="outline"><Link href="/dashboard/bodega">Ver todo el inventario</Link></Button> : null}
        {ready && canEdit('bodega_inventario') && canEdit('fin_compras') ? <Button asChild><Link href="/dashboard/compras/importar-existencias"><Upload className="h-4 w-4" />Importar existencias</Link></Button> : null}
      </PageHeaderActions>
    </PageHeader>

    {!negativeStockMode ? <DataSourceStatusStrip
      reviewHref="/dashboard/calidad-datos"
      sources={[
        sourceStatus.source('inventory', { key: 'inventory', label: 'Bodega MOTIL', state: 'pending', detail: 'Existencias, reservas, conteos y movimientos operacionales.' }),
        sourceStatus.source('canonical', { key: 'canonical', label: 'Productos canónicos', state: 'pending', detail: 'Identidad, unidad, familia y costo de referencia.' }),
        sourceStatus.source('laudus', { key: 'laudus', label: 'Laudus', state: 'pending', detail: 'Verificando la última sincronización del ERP.' }),
        sourceStatus.source('procurement', { key: 'procurement', label: 'Compras', state: 'pending', detail: 'Órdenes, recepciones y necesidades vinculables al producto.' }),
      ]}
    /> : null}

    {!negativeStockMode ? <LaudusInventoryReadinessCard /> : null}

    {!negativeStockMode ? <DataReceptionReadiness
      description="Bodega está preparada para recibir stock y movimientos externos sin reemplazar saldos automáticamente. Cualquier diferencia entre fuentes quedará en conciliación."
      items={[
        { label: 'Productos', ready: true, detail: 'Catálogo canónico disponible.' },
        { label: 'Stock por bodega', ready: true, detail: 'Modelo operacional disponible.' },
        { label: 'Conciliación', ready: true, detail: 'Conflictos se muestran antes de corregir.' },
        { label: 'Stock Laudus', ready: sourceStatus.state('laudus') === 'updated', detail: sourceStatus.state('laudus') === 'updated' ? 'Stock ERP y movimientos sincronizados.' : sourceStatus.state('laudus') === 'review' ? 'Stock ERP sincronizado; existen partidas pendientes de conciliación.' : sourceStatus.state('laudus') === 'syncing' ? 'Sincronización Laudus en curso.' : 'Verificando disponibilidad de la fuente Laudus.' },
      ]}
    /> : null}

    {negativeStockMode ? <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive"/><div><p className="font-medium">Data Health · saldo negativo</p><p className="mt-1 text-muted-foreground">Esta vista filtra posiciones cuyo saldo disponible quedó bajo cero. Antes de corregir el saldo, concilia movimientos, reservas e importación fuente. MOTIL no ajusta cantidades automáticamente.</p></div></div> : null}

    {error ? <StatePanel tone="error" title="No fue posible cargar el inventario" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5" /> : null}

    {!negativeStockMode && diesel ? <section aria-label="Estado de petróleo diésel" className={`rounded-lg border p-5 ${diesel.hasConflict ? 'border-destructive/30 bg-destructive/5' : 'bg-card'}`}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex gap-3"><div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md border bg-background"><Fuel className="h-5 w-5" /></div><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Combustible crítico</p><div className="mt-1 flex flex-wrap items-center gap-2"><h2 className="text-lg font-semibold">Petróleo Diesel</h2>{diesel.hasConflict ? <Badge variant="destructive">Difiere de Laudus</Badge> : dieselCurrent ? <Badge variant={statusVariant(dieselCurrent.stock_status)}>{statusLabels[dieselCurrent.stock_status] || 'Revisar'}</Badge> : null}</div><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{diesel.hasConflict ? 'El saldo operativo MOTIL y el stock ERP Laudus no coinciden y ninguna fuente puede imponerse todavía.' : diesel.sourcesDiffer && diesel.effectiveSource === 'laudus' ? 'Laudus es la fuente más reciente y se usa como cantidad efectiva; el saldo MOTIL queda como contraste histórico.' : 'MOTIL y Laudus concilian dentro de tolerancia.'}</p></div></div>
        {!diesel.hasConflict && diesel.effectiveQuantity != null ? <div className="text-left lg:text-right"><p className="text-xs text-muted-foreground">Disponible</p><p className="text-2xl font-semibold tabular-nums">{number(diesel.effectiveQuantity)} {dieselCurrent?.unit || dieselLaudus?.unit_of_measure || 'unidad'}</p><p className="mt-1 text-xs text-muted-foreground">{diesel.effectiveSource === 'laudus' ? 'Fuente primaria Laudus' : 'Fuente operativa MOTIL'} · {dateTime(dieselLaudus?.laudus_synced_at)}</p></div> : null}
      </div>
      {diesel.sourcesDiffer ? <div className="mt-4 grid gap-px overflow-hidden rounded-md border bg-border md:grid-cols-2">
        <div className="bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">MOTIL · saldo operativo</p><p className="mt-2 text-2xl font-semibold tabular-nums">{dieselCurrent ? `${number(dieselCurrent.quantity_available)} ${dieselCurrent.unit || 'unidad'}` : 'Sin registro'}</p><p className="mt-1 text-sm text-muted-foreground">Costo unitario: {dieselCurrent?.unit_cost != null ? money(dieselCurrent.unit_cost) : '—'} · registro MOTIL {dateTime(dieselLaudus?.motil_updated_at)}</p></div>
        <div className="bg-card p-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Laudus · stock ERP</p><p className="mt-2 text-2xl font-semibold tabular-nums">{dieselLaudus?.laudus_stock != null ? `${number(dieselLaudus.laudus_stock)} ${dieselLaudus.unit_of_measure || dieselCurrent?.unit || 'unidad'}` : 'Sin evidencia Laudus'}</p><p className="mt-1 text-sm text-muted-foreground">Última evidencia: {dateTime(dieselLaudus?.laudus_synced_at || null)}{dieselLaudus?.stock_position_count ? ` · ${number(dieselLaudus.stock_position_count)} bodegas/posiciones` : ''}</p>{dieselLaudus?.quantity_delta != null ? <p className="mt-2 text-xs font-medium">Δ MOTIL − Laudus: {number(dieselLaudus.quantity_delta)} {dieselLaudus.unit_of_measure || dieselCurrent?.unit || ''}</p> : null}</div>
      </div> : null}
      {diesel.hasConflict ? <div className="mt-3 flex items-start gap-2 text-xs font-medium"><ShieldAlert className="mt-0.5 h-4 w-4 shrink-0"/><span>No usar una cifra única para compra, consumo ni valorización hasta conciliar la diferencia.</span></div> : diesel.sourcesDiffer && diesel.effectiveSource === 'laudus' ? <div className="mt-3 flex items-start gap-2 text-xs font-medium"><PackageCheck className="mt-0.5 h-4 w-4 shrink-0"/><span>Se usa Laudus como cantidad efectiva porque su evidencia es más reciente. MOTIL se conserva para trazabilidad.</span></div> : null}
    </section> : null}

    {!negativeStockMode ? <section className="space-y-3" aria-labelledby="attention-title">
      <div className="flex items-end justify-between gap-4"><div><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Prioridad operacional</p><h2 id="attention-title" className="mt-1 text-lg font-semibold">Qué requiere atención hoy</h2></div><p className="hidden text-xs text-muted-foreground sm:block">Las cifras son derivadas del inventario canónico; no modifican stock.</p></div>
      <div className="grid gap-3 md:grid-cols-3">{attention.map((item) => <Link key={item.label} href={item.href} className="group rounded-lg border bg-card p-4 transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">{item.label}</p><p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{isLoading || error ? '—' : number(item.value)}</p></div><ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" /></div><p className="mt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p></Link>)}</div>
    </section> : null}

    {!negativeStockMode ? <section aria-label="Posición de inventario" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <div className="bg-card px-5 py-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><PackageCheck className="h-4 w-4"/>Productos disponibles</div><p className="mt-2 text-2xl font-semibold tracking-tight">{isLoading || error ? '—' : number(overview.products_with_stock)}</p></div>
      <div className="bg-card px-5 py-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="h-4 w-4"/>Valor del inventario</div><p className="mt-2 text-2xl font-semibold tracking-tight">{isLoading || error ? '—' : valuationTrusted ? money(overview.total_stock_value) : 'En conciliación'}</p>{!valuationTrusted && !isLoading ? <p className="mt-1 text-xs text-muted-foreground">Petróleo impide una valorización confiable hasta conciliar fuentes.</p> : null}</div>
      <div className="bg-card px-5 py-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><AlertTriangle className="h-4 w-4"/>Conteos pendientes</div><p className="mt-2 text-2xl font-semibold tracking-tight">{isLoading || error ? '—' : number(overview.count_overdue_products)}</p></div>
    </section> : null}

    <section className="space-y-4">
      <div className="flex flex-col gap-1"><h2 className="text-lg font-semibold">Existencias</h2><p className="text-sm text-muted-foreground">Busca por producto o código y abre la posición para revisar su evidencia.</p></div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center"><div className="relative flex-1"><Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código o producto" /></div><Select value={status} onValueChange={setStatus}><SelectTrigger className="w-full lg:w-52"><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todos los estados</SelectItem><SelectItem value="healthy">Disponible</SelectItem><SelectItem value="reorder">Reponer</SelectItem><SelectItem value="out_of_stock">Sin stock</SelectItem><SelectItem value="negative">Revisar saldo</SelectItem><SelectItem value="expired">Vencido</SelectItem><SelectItem value="expiring">Próximo a vencer</SelectItem></SelectContent></Select></div>

      {isLoading ? <StatePanel tone="loading" title="Cargando inventario" description="Consultando las existencias registradas." /> : !error && positions.length === 0 ? <StatePanel tone="neutral" title={negativeStockMode ? 'No quedan saldos negativos' : 'No hay productos para mostrar'} description={negativeStockMode ? 'La cola Data Health está vacía para este filtro.' : 'Prueba con otros filtros o revisa si las existencias ya fueron importadas.'} /> : null}

      {!isLoading && positions.length > 0 ? <div className="overflow-hidden rounded-lg border bg-card"><div className="hidden grid-cols-[120px_1fr_135px_150px_120px_130px_125px_32px] gap-4 border-b bg-muted/40 px-4 py-3 text-xs font-medium uppercase tracking-wide text-muted-foreground lg:grid"><span>Código</span><span>Producto</span><span>Disponible</span><span>Laudus ERP</span><span>Bodega</span><span>Evidencia</span><span>Estado</span><span /></div>{positions.map((row) => {
        const conflictedDiesel = row.product_code === 'Combustible001' && Boolean(diesel?.hasConflict);
        return <Link key={row.stock_id} href={`/dashboard/bodega/productos/${row.product_id}`} className="group grid gap-2 border-b px-4 py-4 transition-colors last:border-0 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring lg:grid-cols-[120px_1fr_135px_150px_120px_130px_125px_32px] lg:items-center lg:gap-4"><p className="font-mono text-sm">{row.product_code}</p><div><p className="font-medium group-hover:text-primary">{row.product_name}</p><p className="text-xs text-muted-foreground">{row.family || 'Sin familia'} · {row.unit || 'unidad'}</p></div><p className="text-sm font-medium tabular-nums"><span className="text-muted-foreground lg:hidden">Disponible: </span>{conflictedDiesel ? 'En conciliación' : `${number(row.effective_quantity ?? row.quantity_available)} ${row.unit || ''}`}{!conflictedDiesel && row.effective_source ? <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">{row.effective_source === 'laudus' ? 'Fuente: Laudus' : 'Fuente: MOTIL'}</span> : null}</p><div className="text-sm"><span className="text-muted-foreground lg:hidden">Laudus ERP: </span>{row.laudus_stock == null ? <span className="text-muted-foreground">Sin vínculo</span> : <><span className="font-medium tabular-nums">{number(row.laudus_stock)} {row.unit || ''}</span>{row.laudus_reconciliation_state === 'quantity_mismatch' ? <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">Δ {row.laudus_quantity_delta == null ? '—' : number(row.laudus_quantity_delta)}</p> : row.laudus_reconciliation_state === 'aligned' ? <p className="mt-0.5 text-xs text-muted-foreground">Coincide</p> : null}</>}</div><p className="text-sm"><span className="text-muted-foreground lg:hidden">Bodega: </span>{row.warehouse_code || 'Sin código'}</p><p className="text-sm text-muted-foreground"><span className="lg:hidden">Evidencia: </span>{dateOnly(row.last_counted_date)}</p>{row.effective_source === 'laudus' ? <Badge variant="outline">Laudus primario</Badge> : row.laudus_reconciliation_state === 'quantity_mismatch' ? <Badge variant="destructive">Difiere Laudus</Badge> : conflictedDiesel ? <Badge variant="destructive">Revisar fuente</Badge> : <Badge variant={statusVariant(row.stock_status)}>{statusLabels[row.stock_status] || 'Revisar'}</Badge>}<ArrowRight className="hidden h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1 lg:block" /></Link>;
      })}</div> : null}
    </section>
  </div>;
}
