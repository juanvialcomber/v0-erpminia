'use client';
import { formatWorkOrderDate, isWorkOrderScheduledOverdue } from '@/lib/maintenance/work-order-calendar-date.mjs';

import Link from 'next/link';
import useSWR from 'swr';
import { isStockBelowMinimum } from '@/lib/inventory-alerts';
import {
  AlertCircle,
  ArrowRight,
  CalendarClock,
  CircleAlert,
  CircleCheckBig,
  DollarSign,
  Gauge,
  QrCode,
  Smartphone,
  TrendingDown,
  TrendingUp,
  Wrench,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

const fetcher = (url: string) => fetch(url, { credentials: 'include' }).then((res) => res.json());

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('es-CL')}`;
}

function number(value: number) {
  return Number(value || 0).toLocaleString('es-CL');
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

type AssetRow = {
  status: string | null;
  criticality: string | null;
};

type WorkOrderRow = {
  id: string;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  work_order_number: string | null;
  code: string | null;
  title: string | null;
  asset_name: string | null;
};

type FuelItem = {
  quantity: number | string | null;
  unit_cost: number | string | null;
  min_stock: number | string | null;
};

type CostSummary = {
  rows: number;
  totalCost: number;
  assets: number;
  averageCostPerAsset: number;
  matchedRows?: number;
  unmatchedRows?: number;
};

type CostCenterMachine = {
  id: string;
  code: string;
  name: string;
  family: string;
  rootCode: string;
  status: string;
  source: 'cost_center';
  description?: string | null;
};

type CostCenterMachineResponse = {
  machines?: CostCenterMachine[];
  summary?: {
    total?: number;
    families?: number;
    source?: string;
  };
};

type AssetCostRow = {
  id: string;
  assetName: string | null;
  assetCode: string | null;
  category?: string | null;
  totalCost: number;
  rows?: number | null;
  lastDate?: string | null;
};

export function MaintenanceExecutiveDashboard() {
  const { data: assetsData, mutate: mutateAssets } = useSWR('/api/maquinaria/machinery', fetcher);
  const { data: machineCatalogData, isLoading: machineCatalogLoading, mutate: mutateMachineCatalog } = useSWR<CostCenterMachineResponse>(
    '/api/maintenance/cost-center-machines',
    fetcher,
  );
  const { data: ordersData, mutate: mutateOrders } = useSWR('/api/maintenance/work-orders', fetcher);
  const { data: costsData, mutate: mutateCosts } = useSWR('/api/maintenance/equipment-costs?view=summary', fetcher);
  const { data: mttrData, mutate: mutateMttr } = useSWR('/api/maintenance/mttr', fetcher);
  const { data: preventiveData, mutate: mutatePreventive } = useSWR('/api/maintenance/preventive', fetcher);
  const { data: tiresData, mutate: mutateTires } = useSWR('/api/maintenance/neumaticos', fetcher);
  const { data: componentsData, mutate: mutateComponents } = useSWR('/api/maintenance/componentes-mayores', fetcher);
  const { data: fuelData, mutate: mutateFuel } = useSWR('/api/bodega/inventory?category=Combustible&pageSize=100', fetcher);

  const machinery = (Array.isArray(assetsData?.machinery) ? assetsData.machinery : []) as Array<AssetRow & { code?: string | null }>;
  const assets = machinery as AssetRow[];
  const machineCatalog = Array.isArray(machineCatalogData?.machines) ? machineCatalogData.machines : [];
  const workOrders = (Array.isArray(ordersData?.workOrders) ? ordersData.workOrders : []) as WorkOrderRow[];
  const tireSummary = tiresData?.summary || { totalItems: 0, lowStock: 0, totalQuantity: 0, totalValue: 0 };
  const preventiveSummary = preventiveData?.summary || { total: 0, enabled: 0, overdue: 0, dueSoon: 0 };
  const componentSummary = componentsData?.summary || { totalTemplates: 0, totalComponents: 0, degraded: 0, failures: 0 };
  const costSummary: CostSummary = costsData?.summary || { rows: 0, totalCost: 0, assets: 0, averageCostPerAsset: 0 };
  const assetCosts = Array.isArray(costsData?.assetCosts) ? (costsData.assetCosts as AssetCostRow[]) : [];
  const fuelItems = (Array.isArray(fuelData?.inventory) ? fuelData.inventory : []) as FuelItem[];
  const fuelSummary = fuelItems.reduce(
    (acc: { totalItems: number; totalQuantity: number; totalValue: number; lowStock: number }, item) => {
      const quantity = Number(item.quantity || 0);
      const unitCost = Number(item.unit_cost || 0);
      const minStock = Number(item.min_stock || 0);
      acc.totalItems += 1;
      acc.totalQuantity += quantity;
      acc.totalValue += quantity * unitCost;
      if (isStockBelowMinimum(quantity, minStock)) acc.lowStock += 1;
      return acc;
    },
    { totalItems: 0, totalQuantity: 0, totalValue: 0, lowStock: 0 },
  );

  const isLoading = machineCatalogLoading;

  const totalAssets = machineCatalog.length || machinery.length;
  const activeAssets = machineCatalog.filter((asset) => ['activo', 'operativo', 'active', 'operational'].includes(normalizeStatus(asset.status))).length;
  const maintenanceAssets = assets.filter((asset) => ['maintenance', 'mantenimiento'].includes(normalizeStatus(asset.status))).length;
  const criticalAssets = assets.filter((asset) => ['critical', 'critico', 'high', 'alto'].includes(normalizeStatus(asset.criticality))).length;
  const overdueOrders = workOrders.filter((order) => {
    if (!order.scheduled_date) return false;
    return isWorkOrderScheduledOverdue(order.scheduled_date)
      && !['completed', 'completado', 'closed'].includes(String(order.status || '').toLowerCase());
  }).length;
  const openOrders = workOrders.filter((order) => ['open', 'pending', 'pendiente'].includes(String(order.status || '').toLowerCase())).length;
  const inProgressOrders = workOrders.filter((order) => ['in_progress', 'en_progreso'].includes(String(order.status || '').toLowerCase())).length;
  const completedOrders = workOrders.filter((order) => ['completed', 'completado', 'closed'].includes(String(order.status || '').toLowerCase())).length;
  const criticalOrders = workOrders.filter(
    (order) =>
      ['open', 'pending', 'pendiente', 'in_progress', 'en_progreso'].includes(String(order.status || '').toLowerCase()) &&
      ['high', 'critical', 'urgente'].includes(String(order.priority || '').toLowerCase()),
  );
  const availability = totalAssets > 0 ? Math.round((activeAssets / totalAssets) * 100) : 0;
  const maintenanceCoverage = workOrders.length > 0 ? Math.round((completedOrders / workOrders.length) * 100) : 0;
  const executivePulse = [
    { label: 'Disponibilidad', value: `${availability}%`, tone: availability >= 85 ? 'text-green-500' : availability >= 70 ? 'text-amber-500' : 'text-destructive' },
    { label: 'Cobertura de OT', value: `${maintenanceCoverage}%`, tone: maintenanceCoverage >= 80 ? 'text-green-500' : 'text-amber-500' },
    { label: 'Activos criticos', value: number(criticalAssets), tone: criticalAssets > 0 ? 'text-orange-500' : 'text-green-500' },
    { label: 'OT críticas', value: number(criticalOrders.length), tone: criticalOrders.length > 0 ? 'text-destructive' : 'text-green-500' },
  ];

  const executiveWarnings = [
    overdueOrders > 0 ? `${overdueOrders} órdenes atrasadas requieren atención.` : null,
    preventiveSummary.overdue > 0 ? `${preventiveSummary.overdue} mantenimientos preventivos están vencidos.` : null,
    tireSummary.lowStock > 0 ? `${tireSummary.lowStock} repuestos de neumáticos están bajo mínimo.` : null,
    fuelSummary.lowStock > 0 ? `${fuelSummary.lowStock} ítems de combustible están bajo mínimo.` : null,
    componentSummary.failures > 0 ? `${componentSummary.failures} componentes mayores están en falla.` : null,
  ].filter(Boolean) as string[];

  if (isLoading) {
    return <div className="text-sm text-muted-foreground">Cargando mantenimiento...</div>;
  }

  const cards = [
    { label: 'Equipos totales', value: number(totalAssets), icon: CircleCheckBig, tone: 'text-primary', hint: `${availability}% operativos` },
    { label: 'OT abiertas', value: number(openOrders), icon: Wrench, tone: 'text-orange-500', hint: `${inProgressOrders} en progreso` },
    { label: 'OT atrasadas', value: number(overdueOrders), icon: CircleAlert, tone: 'text-destructive', hint: 'Requieren acción inmediata' },
    { label: 'Costo', value: money(costSummary.totalCost || 0), icon: DollarSign, tone: 'text-orange-500', hint: `${number(costSummary.rows || 0)} registros importados` },
    { label: 'MTTR', value: `${Number(mttrData?.averageMTTR || 0).toFixed(1)} h`, icon: Gauge, tone: 'text-primary', hint: 'Tiempo promedio de reparación' },
    { label: 'Preventivos', value: number(preventiveSummary.enabled), icon: CalendarClock, tone: 'text-blue-500', hint: `${preventiveSummary.dueSoon} próximos a vencer` },
    { label: 'Neumáticos bajo mínimo', value: number(tireSummary.lowStock), icon: TrendingDown, tone: 'text-orange-500', hint: `${number(tireSummary.totalItems)} ítems de neumáticos` },
    { label: 'Combustible bajo mínimo', value: number(fuelSummary.lowStock), icon: TrendingDown, tone: 'text-amber-500', hint: `${number(fuelSummary.totalItems)} ítems de combustible` },
    { label: 'Componentes con fallas', value: number(componentSummary.failures), icon: TrendingUp, tone: 'text-green-500', hint: `${number(componentSummary.totalTemplates)} familias` },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Dashboard gerencial de mantenimiento</h1>
          <p className="mt-2 max-w-2xl text-muted-foreground">
            Vista ejecutiva real para gerencia: estado del día, riesgos, costos, OT críticas y foco operativo en una sola pantalla.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/mantenimiento/planificacion">
              <CalendarClock className="h-4 w-4" />
              Planificación
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/mantenimiento/movil">
              <Smartphone className="h-4 w-4" />
              Operación en terreno
            </Link>
          </Button>
          <Button asChild variant="outline" className="gap-2">
            <Link href="/dashboard/mantenimiento/vehiculos">
              <QrCode className="h-4 w-4" />
              Vehículos y traslados
            </Link>
          </Button>
          <Button
            variant="outline"
            onClick={() => {
              void mutateAssets();
              void mutateMachineCatalog();
              void mutateOrders();
              void mutateCosts();
              void mutateMttr();
              void mutatePreventive();
              void mutateTires();
              void mutateComponents();
              void mutateFuel();
            }}
            className="gap-2"
          >
            <ArrowRight className="h-4 w-4 rotate-180" />
            Recargar
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <card.icon className={`h-4 w-4 ${card.tone}`} />
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              <div className="text-3xl font-bold">{card.value}</div>
              <p className="text-xs text-muted-foreground">{card.hint}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {executivePulse.map((item) => (
          <Card key={item.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">{item.label}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className={`text-3xl font-bold ${item.tone}`}>{item.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border/70 bg-card/90">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5" />
            Señales del día
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Preventivos vencidos</p>
              <p className="text-2xl font-bold text-destructive">{preventiveSummary.overdue}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Preventivos próximos</p>
              <p className="text-2xl font-bold text-orange-500">{preventiveSummary.dueSoon}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">OT atrasadas</p>
              <p className="text-2xl font-bold text-destructive">{overdueOrders}</p>
            </div>
            <div className="rounded-lg border border-border p-3">
              <p className="text-xs text-muted-foreground">Foco en abastecimiento</p>
              <p className="text-2xl font-bold text-amber-500">
                {tireSummary.lowStock + fuelSummary.lowStock}
              </p>
            </div>
          </div>

          {executiveWarnings.length > 0 ? (
            <div className="space-y-2">
              {executiveWarnings.slice(0, 4).map((warning) => (
                <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                  <AlertCircle className="mt-0.5 h-4 w-4" />
                  <span>{warning}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
              No hay señales críticas con la base actual.
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline" className="gap-2">
              <Link href="/dashboard/mantenimiento/planificacion">
                <CalendarClock className="h-4 w-4" />
                Ver planificacion
              </Link>
            </Button>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/dashboard/mantenimiento/bitacora">
                <ArrowRight className="h-4 w-4" />
                Ver bitácora
              </Link>
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Semaforo operativo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Activos operativos</p>
                <p className="text-2xl font-bold text-green-500">{activeAssets}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">En mantenimiento</p>
                <p className="text-2xl font-bold text-blue-500">{maintenanceAssets}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Criticos</p>
                <p className="text-2xl font-bold text-orange-500">{criticalAssets}</p>
              </div>
              <div className="rounded-lg border border-border p-3">
                <p className="text-xs text-muted-foreground">Disponibilidad</p>
                <p className="text-2xl font-bold">{availability}%</p>
              </div>
            </div>

            {executiveWarnings.length > 0 ? (
              <div className="space-y-2">
                {executiveWarnings.map((warning) => (
                  <div key={warning} className="flex items-start gap-2 rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 text-sm text-amber-700">
                    <AlertCircle className="mt-0.5 h-4 w-4" />
                    <span>{warning}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                Sin alertas críticas visibles con la base actual.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Lectura ejecutiva</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">Costo promedio por equipo</span>
              <Badge variant="outline">{money(costSummary.averageCostPerAsset || 0)}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">OT completadas</span>
              <Badge variant="outline">
                {number(
                  workOrders.filter((order) => ['completed', 'completado', 'closed'].includes(String(order.status || '').toLowerCase())).length,
                )}
              </Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">Preventivos vencidos</span>
              <Badge variant="destructive">{preventiveSummary.overdue}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">Componentes mayores en degradacion</span>
              <Badge variant="secondary">{componentSummary.degraded}</Badge>
            </div>
            <div className="flex items-center justify-between rounded-lg border border-border p-3">
              <span className="text-muted-foreground">OT críticas activas</span>
              <Badge variant={criticalOrders.length > 0 ? 'destructive' : 'outline'}>{criticalOrders.length}</Badge>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Top activos de mayor costo</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {assetCosts.length > 0 ? (
              assetCosts.map((asset) => (
                <div key={asset.id} className="flex items-center justify-between rounded-lg border border-border p-3 text-sm">
                  <div>
                    <p className="font-medium">{asset.assetName || asset.assetCode || 'Equipo'}</p>
                    <p className="text-muted-foreground">
                      {asset.rows || 0} filas importadas {asset.category ? `· ${asset.category}` : ''}
                    </p>
                  </div>
                  <Badge variant="outline">{money(asset.totalCost || 0)}</Badge>
                </div>
              ))
            ) : (
              <div className="flex items-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground">
                <AlertCircle className="h-4 w-4" />
                Todavía no hay costo suficiente para mostrar un ranking real.
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Foco operativo de gerencia</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {criticalOrders.length > 0 ? (
              <div className="space-y-2">
                {criticalOrders.map((order) => (
                  <div key={order.id} className="rounded-lg border border-destructive/20 bg-destructive/5 p-3 text-sm">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <p className="font-semibold">{order.work_order_number || order.code || order.title}</p>
                        <p className="text-muted-foreground">{order.title}</p>
                      </div>
                      <Badge variant="destructive">{order.priority || 'critica'}</Badge>
                    </div>
                    <p className="mt-2 text-xs text-muted-foreground">
                      {order.asset_name || 'Sin equipo'} {order.scheduled_date ? `- ${formatWorkOrderDate(order.scheduled_date)}` : ''}
                    </p>
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-lg border border-border p-3 text-sm text-muted-foreground">
                No hay OT críticas activas en este momento.
              </div>
            )}

            <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento">
                  Panel principal
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/bitacora">
                  Bitácora
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/planificacion">
                  Planificación preventiva
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/costos">
                  Costo por equipo
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/neumaticos">
                  Neumáticos
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/personal">
                  Personal de mantenimiento
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/combustible">
                  Combustible
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" className="justify-between">
                <Link href="/dashboard/mantenimiento/componentes-mayores">
                  Componentes mayores
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
