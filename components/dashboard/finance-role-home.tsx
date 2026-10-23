'use client';

import Link from 'next/link';
import useSWR from 'swr';
import {
  AlertTriangle,
  ArrowRight,
  Boxes,
  CircleDollarSign,
  Landmark,
  PackageSearch,
  ShieldCheck,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  PageHeader,
  PageHeaderActions,
  PageHeaderContent,
  PageHeaderDescription,
  PageHeaderEyebrow,
  PageHeaderTitle,
} from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type InboxSummary = {
  total?: number;
  owners?: number;
  critical?: number;
  overdue?: number;
  escalations?: number;
};

type FinancePayload = {
  overview?: Record<string, unknown> | null;
  operationalProcurement?: Record<string, unknown> | null;
  treasury?: Array<Record<string, unknown>>;
};

type InventoryPayload = {
  overview?: Record<string, unknown> | null;
  diesel?: { hasConflict?: boolean } | null;
};

type MaintenancePayload = {
  overview?: {
    total?: number;
    in_progress?: number;
    waiting_procurement?: number;
    waiting_parts?: number;
    totalCost?: number;
    purchaseCommitment?: number;
  } | null;
};

type SupplyRiskPayload = {
  summary?: {
    high_risk?: number;
    medium_risk?: number;
    zero_stock_below_minimum?: number;
    below_minimum?: number;
  } | null;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar la información.');
  return payload;
};

const optionalFetcher = async (url: string) => {
  try {
    return await fetcher(url);
  } catch {
    return null;
  }
};

const numeric = (value: unknown) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const number = (value: unknown) =>
  new Intl.NumberFormat('es-CL', { maximumFractionDigits: 0 }).format(numeric(value));

const amount = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
};

const money = (value: unknown) => {
  const parsed = amount(value);
  return parsed === null
    ? '—'
    : new Intl.NumberFormat('es-CL', {
        style: 'currency',
        currency: 'CLP',
        maximumFractionDigits: 0,
      }).format(parsed);
};

type Priority = {
  label: string;
  detail: string;
  value: string;
  href: string;
  tone: 'critical' | 'warning' | 'neutral';
};

export function FinanceRoleHome({
  name,
  summary,
}: {
  name?: string | null;
  summary?: InboxSummary | null;
}) {
  const finance = useSWR<FinancePayload>('/api/finance/executive', optionalFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });
  const inventory = useSWR<InventoryPayload>('/api/inventory/intelligence', optionalFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });
  const maintenance = useSWR<MaintenancePayload>('/api/maintenance/work-order-flow?limit=200', optionalFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });
  const supplyRisk = useSWR<SupplyRiskPayload>('/api/procurement/supply-risk', optionalFetcher, {
    revalidateOnFocus: false,
    refreshInterval: 120000,
  });

  const financeData = finance.data || null;
  const inventoryData = inventory.data || null;
  const maintenanceData = maintenance.data || null;
  const riskData = supplyRisk.data || null;

  const treasury = financeData?.treasury || [];
  const overdueCount = treasury.reduce((sum, row) => sum + numeric(row.overdue_count), 0);
  const overdueClp = treasury
    .filter((row) => String(row.currency || '').toUpperCase() === 'CLP')
    .reduce((sum, row) => sum + numeric(row.overdue_amount), 0);

  const maintenanceWaiting =
    numeric(maintenanceData?.overview?.waiting_procurement) +
    numeric(maintenanceData?.overview?.waiting_parts);

  const negativeStock = numeric(inventoryData?.overview?.negative_stock_products);
  const outOfStock = numeric(inventoryData?.overview?.out_of_stock_products);
  const highSupplyRisk = numeric(riskData?.summary?.high_risk);
  const missingCostCenters = numeric(financeData?.operationalProcurement?.missing_cost_center_events);

  const priorities: Priority[] = [
    overdueCount > 0
      ? {
          label: 'Pagos vencidos',
          detail: 'Revisa vencimientos antes de comprometer nueva caja.',
          value: overdueClp > 0 ? `${number(overdueCount)} · ${money(overdueClp)}` : number(overdueCount),
          href: '/dashboard/finanzas/pagos',
          tone: 'critical',
        }
      : null,
    maintenanceWaiting > 0
      ? {
          label: 'Mantención esperando abastecimiento',
          detail: 'Órdenes detenidas por compra o disponibilidad de repuestos.',
          value: `${number(maintenanceWaiting)} OT`,
          href: '/dashboard/mantenimiento/gerencial',
          tone: 'warning',
        }
      : null,
    negativeStock > 0
      ? {
          label: 'Inventario por conciliar',
          detail: 'Saldos negativos: no usar como disponibilidad hasta revisar movimientos.',
          value: `${number(negativeStock)} posiciones`,
          href: '/dashboard/bodega?status=negative',
          tone: 'critical',
        }
      : null,
    highSupplyRisk > 0
      ? {
          label: 'Riesgo alto de abastecimiento',
          detail: 'Señales que combinan stock, proveedor, precio o dependencia operacional.',
          value: `${number(highSupplyRisk)} señales`,
          href: '/dashboard/compras',
          tone: 'warning',
        }
      : null,
    missingCostCenters > 0
      ? {
          label: 'Compras sin centro de costo',
          detail: 'Excepciones que requieren clasificación antes de una lectura financiera confiable.',
          value: `${number(missingCostCenters)} eventos`,
          href: '/dashboard/finanzas/centros',
          tone: 'warning',
        }
      : null,
  ].filter((item): item is Priority => Boolean(item)).slice(0, 3);

  const anyLoading = finance.isLoading || inventory.isLoading || maintenance.isLoading || supplyRisk.isLoading;
  const allUnavailable = !anyLoading && !financeData && !inventoryData && !maintenanceData && !riskData;

  const recognizedCost = financeData?.overview?.recognized_clp;
  const committedPurchases = financeData?.overview?.committed_clp;
  const stockValue = inventoryData?.diesel?.hasConflict ? null : inventoryData?.overview?.total_stock_value;
  const maintenanceCommitment = maintenanceData?.overview?.purchaseCommitment;

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>GERENCIA DE FINANZAS</PageHeaderEyebrow>
          <PageHeaderTitle>{name ? `Finanzas · ${name}` : 'Finanzas'}</PageHeaderTitle>
          <PageHeaderDescription>
            Caja, compras, inventario y mantenimiento en una sola lectura. Primero excepciones; después detalle.
          </PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions>
          <Button asChild>
            <Link href="/dashboard/finanzas">
              <Landmark className="h-4 w-4" />
              Abrir Finanzas
            </Link>
          </Button>
        </PageHeaderActions>
      </PageHeader>

      <section className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 border-b p-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Qué requiere atención</p>
            <h2 className="mt-1 text-xl font-semibold tracking-tight">Prioridades financieras con impacto operacional</h2>
            <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
              MOTIL cruza señales financieras con Compras, Bodega y Mantención. No modifica stock ni órdenes desde esta vista.
            </p>
          </div>
          {summary?.critical ? <Badge variant="destructive">{number(summary.critical)} tareas críticas asignadas</Badge> : null}
        </div>

        {anyLoading ? (
          <div className="p-5"><StatePanel tone="loading" title="Reuniendo contexto financiero y operacional" /></div>
        ) : allUnavailable ? (
          <div className="p-5"><StatePanel tone="warning" title="No fue posible reunir el contexto completo" description="Puedes entrar a cada módulo para revisar su información disponible." /></div>
        ) : priorities.length ? (
          <div className="grid gap-px bg-border lg:grid-cols-3">
            {priorities.map((item) => (
              <Link key={item.label} href={item.href} className="group bg-card p-5 transition-colors hover:bg-muted/30">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium">{item.label}</p>
                    <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums">{item.value}</p>
                  </div>
                  <ArrowRight className="mt-1 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-1" />
                </div>
                <p className="mt-3 text-xs leading-5 text-muted-foreground">{item.detail}</p>
              </Link>
            ))}
          </div>
        ) : (
          <div className="flex items-start gap-3 p-5">
            <ShieldCheck className="mt-0.5 h-5 w-5 text-muted-foreground" />
            <div>
              <p className="text-sm font-medium">Sin excepciones materiales en las señales disponibles</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Esto no acredita ausencia de riesgo; indica que las fuentes consultadas no levantan una prioridad financiera inmediata.
              </p>
            </div>
          </div>
        )}
      </section>

      <section aria-label="Contexto económico operacional" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><CircleDollarSign className="h-4 w-4" />Costo reconocido</div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{financeData ? money(recognizedCost) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Hechos financieros reconocidos en MOTIL.</p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><PackageSearch className="h-4 w-4" />Compras comprometidas</div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{financeData ? money(committedPurchases) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">Compromiso registrado; no equivale a pago ejecutado.</p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Boxes className="h-4 w-4" />Valor inventario</div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{inventoryData ? (inventoryData.diesel?.hasConflict ? 'En conciliación' : money(stockValue)) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{outOfStock > 0 ? `${number(outOfStock)} productos sin stock.` : 'Según la evidencia disponible de Bodega.'}</p>
        </div>
        <div className="bg-card p-5">
          <div className="flex items-center gap-2 text-xs text-muted-foreground"><Wrench className="h-4 w-4" />Compromiso mantenimiento</div>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{maintenanceData ? money(maintenanceCommitment) : '—'}</p>
          <p className="mt-1 text-xs text-muted-foreground">{maintenanceWaiting > 0 ? `${number(maintenanceWaiting)} OT esperan compra o repuesto.` : 'Sin bloqueo de abastecimiento visible en OT consultadas.'}</p>
        </div>
      </section>

      <section className="rounded-lg border bg-card">
        <div className="border-b p-5">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] text-muted-foreground">Tu alcance</p>
          <h2 className="mt-1 text-lg font-semibold">Ver el costo completo sin intervenir la operación</h2>
          <p className="mt-1 text-sm text-muted-foreground">Daniel puede editar Finanzas, Reportes y Centros de Costos; los módulos operacionales cruzados son de consulta.</p>
        </div>
        <div className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-4">
          {[
            { label: 'Finanzas', detail: 'Caja, pagos, trazabilidad y reportes.', href: '/dashboard/finanzas', badge: 'Edición', Icon: Landmark },
            { label: 'Compras', detail: 'OC, proveedores y riesgo de abastecimiento.', href: '/dashboard/compras', badge: 'Consulta', Icon: PackageSearch },
            { label: 'Bodega', detail: 'Stock, valorización y conciliaciones.', href: '/dashboard/bodega', badge: 'Consulta', Icon: Boxes },
            { label: 'Mantención', detail: 'OT, costos, repuestos y activos.', href: '/dashboard/mantenimiento/gerencial', badge: 'Consulta', Icon: Wrench },
          ].map(({ label, detail, href, badge, Icon }) => (
            <Link key={label} href={href} className="group bg-card p-5 transition-colors hover:bg-muted/30">
              <div className="flex items-start justify-between gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border bg-background"><Icon className="h-4 w-4" /></div>
                <Badge variant="outline">{badge}</Badge>
              </div>
              <p className="mt-4 text-sm font-medium">{label}</p>
              <p className="mt-1 text-xs leading-5 text-muted-foreground">{detail}</p>
              <div className="mt-4 flex items-center gap-1 text-xs font-medium">Abrir <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-1" /></div>
            </Link>
          ))}
        </div>
      </section>

      {(highSupplyRisk > 0 || numeric(riskData?.summary?.medium_risk) > 0) ? (
        <div className="flex items-start gap-3 rounded-lg border bg-card p-4 text-sm">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
          <div>
            <p className="font-medium">Abastecimiento requiere seguimiento</p>
            <p className="mt-1 text-muted-foreground">
              {number(highSupplyRisk)} señales altas y {number(riskData?.summary?.medium_risk)} medias. Son señales preventivas; no equivalen a compras aprobadas.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
