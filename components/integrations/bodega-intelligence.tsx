'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Boxes, CircleDollarSign, Link2, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';

type Case = {
  productId: string | null;
  productCode: string;
  productName: string;
  family: string | null;
  decision: 'maintenance' | 'stock' | 'price' | 'supplier' | 'review';
  title: string;
  action: string;
  riskScore: number;
  quantityAvailable: number;
  minimumRequired: number | null;
  latestUnitPrice: number | null;
  medianUnitPrice: number | null;
  priceRatio: number | null;
  supplierCount: number;
  topSupplierShare: number | null;
  purchaseLines: number;
  lastPurchaseAt: string | null;
  activeWorkOrders: number;
  activeShortageQty: number;
  laudusMatched: boolean;
  evidence: string[];
  source: string;
};

type Payload = {
  summary: {
    totalProducts: number;
    laudusMatchedProducts: number;
    highRisk: number;
    mediumRisk: number;
    activeMaintenanceShortages: number;
    priceOutliers20pct: number;
    singleSupplierProducts: number;
  };
  cases: Case[];
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la inteligencia de Bodega.');
  return payload;
};

const money = (value: number | null) =>
  value == null
    ? '—'
    : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(value);

const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value))
    : 'Sin compra observada';

const iconFor = {
  maintenance: Wrench,
  stock: Boxes,
  price: CircleDollarSign,
  supplier: Link2,
  review: Boxes,
};

export function BodegaIntelligence() {
  const { data, error, isLoading } = useSWR<Payload>(
    '/api/inventory/laudus-intelligence',
    fetcher,
    { revalidateOnFocus: false, refreshInterval: 120000 },
  );

  if (isLoading) {
    return <StatePanel tone="loading" title="MOTIL está cruzando Bodega y Laudus" description="Stock, historial de compra, precio, proveedor y demanda de mantenimiento." />;
  }

  if (error) {
    return <StatePanel tone="warning" title="Inteligencia de Bodega no disponible" description="El inventario sigue disponible; MOTIL no reemplaza evidencia faltante por supuestos." />;
  }

  const cases = data?.cases || [];

  return (
    <section className="overflow-hidden rounded-lg border bg-card">
      <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">MOTIL Intelligence · Bodega</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">Qué revisar primero</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            MOTIL combina disponibilidad con compras Laudus y contexto de mantenimiento. Estar bajo mínimo, por sí solo, no convierte un producto en urgente.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant="outline">{data?.summary.laudusMatchedProducts.toLocaleString('es-CL') || '0'} productos con evidencia Laudus</Badge>
          <Badge variant="outline">{data?.summary.activeMaintenanceShortages || 0} quiebres ligados a OT</Badge>
        </div>
      </div>

      {cases.length ? (
        <div className="divide-y">
          {cases.map((item) => {
            const Icon = iconFor[item.decision];
            const href = item.productId ? `/dashboard/bodega/productos/${item.productId}` : '/dashboard/bodega';
            const priceDelta = item.priceRatio != null ? Math.round((item.priceRatio - 1) * 100) : null;
            return (
              <Link key={item.productCode} href={href} className="group block p-5 transition-colors hover:bg-muted/30">
                <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_220px] xl:items-start">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Icon className="h-4 w-4 text-muted-foreground" />
                      <p className="font-mono text-xs text-muted-foreground">{item.productCode}</p>
                      <Badge variant={item.decision === 'stock' || item.decision === 'maintenance' ? 'destructive' : 'outline'}>{item.title}</Badge>
                    </div>
                    <h3 className="mt-2 text-sm font-semibold">{item.productName}</h3>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {item.family || 'Sin familia'} · última compra {date(item.lastPurchaseAt)}
                    </p>
                    <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                      <span>Stock {item.quantityAvailable}</span>
                      {item.latestUnitPrice != null ? <span>Último precio {money(item.latestUnitPrice)}</span> : null}
                      {item.medianUnitPrice != null ? <span>Mediana {money(item.medianUnitPrice)}</span> : null}
                      {priceDelta != null ? <span>{priceDelta >= 0 ? '+' : ''}{priceDelta}% vs mediana</span> : null}
                      {item.supplierCount > 0 ? <span>{item.supplierCount} proveedor(es)</span> : null}
                      {item.activeWorkOrders > 0 ? <span>{item.activeWorkOrders} OT activas</span> : null}
                    </div>
                    <p className="mt-3 text-sm"><span className="font-medium">Siguiente decisión:</span> {item.action}</p>
                  </div>
                  <div className="flex items-center justify-between gap-3 xl:flex-col xl:items-end">
                    <div className="text-left xl:text-right">
                      <p className="text-xs text-muted-foreground">Evidencia</p>
                      <p className="mt-1 text-sm font-medium">{item.source}</p>
                    </div>
                    <span className="inline-flex items-center gap-1 text-sm font-medium text-primary">
                      Ver producto <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" />
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="p-5">
          <p className="text-sm font-medium">Sin casos materiales priorizados</p>
          <p className="mt-1 text-xs text-muted-foreground">MOTIL no genera una alerta sólo porque un producto esté bajo el mínimo registrado.</p>
        </div>
      )}

      <div className="border-t bg-muted/20 px-5 py-3 text-xs text-muted-foreground">
        Lectura solamente · no ajusta stock · no repone automáticamente · no modifica Laudus.
      </div>
    </section>
  );
}
