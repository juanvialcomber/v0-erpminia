'use client';

import useSWR from 'swr';
import { Gauge, RefreshCw, TrendingDown, TrendingUp, Wrench } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { StatePanel } from '@/components/ui/state-panel';
import { isWorkOrderScheduledOverdue } from '@/lib/maintenance/work-order-calendar-date.mjs';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la fuente de indicadores.');
  return payload;
};

function money(value: number | null | undefined) {
  return value == null ? '—' : `$${Number(value).toLocaleString('es-CL')}`;
}

function normalizeStatus(value: string | null | undefined) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();
}

type WorkOrderRow = {
  status: string | null;
  scheduled_date: string | null;
};

type CostCenterMachine = {
  status: string;
};

type CostCenterMachineResponse = {
  machines?: CostCenterMachine[];
};

type SummaryCosts = {
  totalCost: number;
  totalWorkOrders: number;
  totalRecords: number;
  assets: number;
  averageCostPerAsset: number;
};

export function MaintenanceIndicatorsBoard() {
  const mttr = useSWR('/api/maintenance/mttr', fetcher, { revalidateOnFocus: false });
  const orders = useSWR('/api/maintenance/work-orders', fetcher, { revalidateOnFocus: false });
  const machineCatalog = useSWR<CostCenterMachineResponse>('/api/maintenance/cost-center-machines', fetcher, { revalidateOnFocus: false });
  const costs = useSWR('/api/maintenance/equipment-costs?view=summary', fetcher, { revalidateOnFocus: false });

  const workOrders = (Array.isArray(orders.data?.workOrders) ? orders.data.workOrders : []) as WorkOrderRow[];
  const machineRows = (Array.isArray(machineCatalog.data?.machines) ? machineCatalog.data.machines : []) as CostCenterMachine[];
  const summaryCosts = costs.data?.summary as SummaryCosts | undefined;

  const ordersAvailable = !orders.isLoading && !orders.error && Boolean(orders.data);
  const catalogAvailable = !machineCatalog.isLoading && !machineCatalog.error && Boolean(machineCatalog.data);
  const mttrAvailable = !mttr.isLoading && !mttr.error && Boolean(mttr.data);
  const costsAvailable = !costs.isLoading && !costs.error && Boolean(summaryCosts);

  const openOrders = workOrders.filter((order) => ['open', 'pending', 'pendiente'].includes(normalizeStatus(order.status))).length;
  const inProgressOrders = workOrders.filter((order) => ['in_progress', 'en_progreso'].includes(normalizeStatus(order.status))).length;
  const completedOrders = workOrders.filter((order) => ['completed', 'completado', 'closed'].includes(normalizeStatus(order.status))).length;
  const overdueOrders = workOrders.filter((order) => {
    return isWorkOrderScheduledOverdue(order.scheduled_date)
      && !['completed', 'completado', 'closed'].includes(normalizeStatus(order.status));
  }).length;

  const activeAssets = machineRows.filter((asset) => ['active', 'activo', 'operativo', 'operational'].includes(normalizeStatus(asset.status))).length;
  const catalogAvailability = catalogAvailable && machineRows.length > 0 ? Math.round((activeAssets / machineRows.length) * 100) : null;
  const mttrAvailability = mttrAvailable && mttr.data?.availability != null ? Number(mttr.data.availability) : null;
  const availabilityValue = mttrAvailability ?? catalogAvailability;
  const anySourceError = mttr.error || orders.error || machineCatalog.error || costs.error;

  const cards = [
    { label: 'MTTR promedio', value: mttrAvailable && mttr.data?.averageMTTR != null ? `${Number(mttr.data.averageMTTR).toFixed(1)} h` : '—', icon: Gauge },
    { label: 'Disponibilidad', value: availabilityValue == null ? '—' : `${availabilityValue.toFixed(1)}%`, icon: TrendingUp },
    { label: 'Costo', value: costsAvailable ? money(summaryCosts?.totalCost) : '—', icon: TrendingDown },
    { label: 'OT cerradas', value: ordersAvailable ? String(completedOrders) : '—', icon: Wrench },
  ];

  const refreshAll = () => {
    void mttr.mutate();
    void orders.mutate();
    void machineCatalog.mutate();
    void costs.mutate();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Indicadores de mantenimiento</h1>
          <p className="mt-2 text-muted-foreground">MTTR, disponibilidad, órdenes y costo, manteniendo separada la disponibilidad de cada fuente.</p>
        </div>
        <Button variant="outline" onClick={refreshAll} className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Recargar indicadores
        </Button>
      </div>

      {anySourceError ? <StatePanel tone="warning" title="Indicadores parcialmente disponibles" description="Las métricas cuya fuente no respondió se muestran como —; no se sustituyen por cero." actions={<Button variant="outline" onClick={refreshAll}>Reintentar</Button>} className="min-h-0" /> : null}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.label}>
            <CardHeader className="pb-2">
              <CardTitle className="flex items-center gap-2 text-sm">
                <card.icon className="h-4 w-4 text-muted-foreground" />
                {card.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-semibold">{card.value}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Desglose de órdenes de trabajo</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {[
              ['Abiertas', ordersAvailable ? openOrders : '—'],
              ['En progreso', ordersAvailable ? inProgressOrders : '—'],
              ['Completadas', ordersAvailable ? completedOrders : '—'],
              ['Atrasadas', ordersAvailable ? overdueOrders : '—'],
            ].map(([label, value]) => <div key={String(label)} className="rounded-lg border border-border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-2xl font-semibold">{value}</p></div>)}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
