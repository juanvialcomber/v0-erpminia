'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Boxes, CircleDollarSign, Link2, ShieldCheck, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la economía de repuestos.');
  return payload;
};
const money = (value: unknown) => new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value || 0));
const number = (value: unknown) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value || 0));
const copy: Record<string,{title:string;detail:string;action:string}> = {
  material_traceability_required: { title: 'Economía de repuestos aún no trazable', detail: 'Las OT de este equipo todavía no tienen repuestos ligados al activo. MOTIL no atribuye compras Laudus por centro de costo ni por similitud de texto.', action: 'Registrar materiales en las próximas OT para construir costo y dependencia de proveedor por activo.' },
  installation_evidence_required: { title: 'Repuestos declarados, instalación aún no confirmada', detail: 'Existe vínculo producto–OT–activo, pero falta evidencia de instalación para tratarlo como consumo ejecutado.', action: 'Cerrar la trazabilidad de entrega, instalación o devolución en la OT.' },
  laudus_product_match_required: { title: 'Consumo trazado sin contexto Laudus suficiente', detail: 'Los repuestos están ligados al activo, pero sus SKU todavía no tienen historial Laudus comparable.', action: 'Resolver identidad de producto antes de interpretar precio o dependencia de proveedor.' },
  economic_context_available: { title: 'Contexto económico de repuestos disponible', detail: 'MOTIL conecta consumo trazado del activo con historial Laudus de los mismos SKU.', action: 'Usar precio y proveedores como contexto para la próxima decisión de mantenimiento o abastecimiento.' }
};

export function AssetSupplyEconomics({ assetId }: { assetId: string }) {
  const url = assetId ? '/api/maintenance/assets/' + encodeURIComponent(assetId) + '/supply-economics' : null;
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  if (isLoading) return <StatePanel tone="loading" title="Construyendo economía de repuestos" description="Conectando OT, repuestos, producto y evidencia Laudus." />;
  if (error || !data) return <StatePanel tone="error" title="No fue posible cargar la economía de repuestos" description={error instanceof Error ? error.message : 'Sin datos disponibles.'} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;
  const state = copy[data.readiness] || copy.material_traceability_required;
  const products = Array.isArray(data.products) ? data.products : [];
  return <section className="overflow-hidden rounded-lg border bg-card">
    <div className="flex flex-col gap-4 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
      <div><p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">MOTIL Intelligence · Activo 360</p><h2 className="mt-1 text-xl font-semibold tracking-tight">{state.title}</h2><p className="mt-1 max-w-3xl text-sm text-muted-foreground">{state.detail}</p><p className="mt-3 text-sm"><span className="font-medium">Siguiente decisión:</span> {state.action}</p></div>
      <Badge variant={data.readiness === 'economic_context_available' ? 'secondary' : 'outline'}>{data.readiness === 'economic_context_available' ? 'Evidencia conectada' : 'Cobertura incompleta'}</Badge>
    </div>
    <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
      <Metric icon={Boxes} label="Productos ligados" value={number(data.summary?.linked_products)} detail={number(data.summary?.installed_products) + ' con instalación registrada'} />
      <Metric icon={Wrench} label="Vínculos con OT" value={number(data.summary?.work_order_links)} detail={number(data.summary?.installed_qty) + ' unidades instaladas'} />
      <Metric icon={CircleDollarSign} label="Costo de repuestos trazado" value={money(data.summary?.traced_parts_cost)} detail="Sólo registros ligados al activo" />
      <Metric icon={Link2} label="Productos con Laudus" value={number(data.summary?.laudus_matched_products)} detail="Historial de compra del mismo SKU" />
    </div>
    {products.length ? <div className="divide-y border-t">{products.slice(0,6).map((product:any) => {
      const delta = product.price_ratio == null ? null : Math.round((Number(product.price_ratio)-1)*100);
      return <Link key={product.product_id} href={'/dashboard/bodega/productos/'+product.product_id} className="group grid gap-3 p-4 hover:bg-muted/30 md:grid-cols-[minmax(0,1fr)_180px_180px] md:items-center">
        <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-xs text-muted-foreground">{product.product_code}</span>{product.laudus_matched ? <Badge variant="outline">Laudus</Badge> : null}</div><p className="mt-1 text-sm font-medium">{product.name}</p><p className="mt-1 text-xs text-muted-foreground">{number(product.installed_qty)} instaladas · {product.work_orders} OT</p></div>
        <div><p className="text-xs text-muted-foreground">Costo trazado</p><p className="mt-1 text-sm font-medium">{money(product.traced_parts_cost)}</p></div>
        <div className="flex items-center justify-between gap-3 md:block md:text-right"><div><p className="text-xs text-muted-foreground">Precio Laudus</p><p className="mt-1 text-sm font-medium">{product.latest_unit_price == null ? '—' : money(product.latest_unit_price)}{delta == null ? '' : ' · ' + (delta >= 0 ? '+' : '') + delta + '%'}</p></div><ArrowRight className="h-4 w-4 text-muted-foreground md:ml-auto md:mt-2" /></div>
      </Link>;
    })}</div> : null}
    <div className="grid gap-3 border-t bg-muted/20 p-4 text-xs text-muted-foreground md:grid-cols-3">
      <Trust icon={CircleDollarSign} title="Costo" text={data.semantics?.traced_parts_cost} />
      <Trust icon={Link2} title="Laudus" text={data.semantics?.laudus_history} />
      <Trust icon={ShieldCheck} title="TCO" text={data.semantics?.asset_tco} />
    </div>
  </section>;
}
function Metric({ icon: Icon, label, value, detail }: { icon: typeof Boxes; label: string; value: string; detail: string }) { return <div className="bg-card p-4"><div className="flex items-center gap-2 text-xs text-muted-foreground"><Icon className="h-4 w-4"/>{label}</div><p className="mt-2 text-xl font-semibold tabular-nums">{value}</p><p className="mt-1 text-xs text-muted-foreground">{detail}</p></div>; }
function Trust({ icon: Icon, title, text }: { icon: typeof Boxes; title: string; text?: string }) { return <div><div className="flex items-center gap-2 font-medium text-foreground"><Icon className="h-4 w-4"/>{title}</div><p className="mt-1 leading-5">{text || 'Sin definición disponible.'}</p></div>; }
