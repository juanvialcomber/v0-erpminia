'use client';

import { useState } from 'react';
import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, Boxes, RefreshCw } from 'lucide-react';
import { useModuleAccess } from '@/hooks/use-module-access';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

type Row = {
  requirementId: string;
  workOrderId: string;
  workOrderNumber: string | null;
  workOrderTitle: string | null;
  workOrderStatus: string | null;
  priority: string | null;
  scheduledDate: string | null;
  productCode: string | null;
  productName: string | null;
  unit: string | null;
  quantityRequired: number;
  historicalQuantityAvailable: number | null;
  historicalShortage: number | null;
  requirementStatus: string | null;
  requiredDate: string | null;
  notes: string | null;
  observedLaudusQuantity: number | null;
  stockReconciliationState: string;
  operationalResolution: string | null;
  stockSourceDate: string | null;
  stockSyncedAt: string | null;
};

type ResponseData = {
  sourceAuthority?: {
    authority_state?: string | null;
    authority_reason?: string | null;
    latest_laudus_stock_sync?: string | null;
    latest_laudus_stock_date?: string | null;
  } | null;
  rows?: Row[];
  readOnly?: boolean;
  error?: string;
};

const fetcher = async (url: string): Promise<ResponseData> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la relación Bodega–Mantención');
  return payload as ResponseData;
};

const quantity = (value: number | null, unit: string | null) => value === null
  ? 'Sin coincidencia actual'
  : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(value) + (unit ? ' ' + unit : '');

const historicalOrderStatuses = new Set(['completed', 'closed', 'cancelled', 'canceled']);
const isHistoricalOrder = (status: string | null) => historicalOrderStatuses.has(String(status || '').toLowerCase());

const reconciliationLabel: Record<string, string> = {
  aligned: 'Conciliado',
  quantity_mismatch: 'Conciliar cantidad',
  missing_in_motil: 'Sin contraparte MOTIL',
  review_identity_conflict: 'Revisar identidad del producto',
  laudus_only_zero: 'Laudus: saldo cero',
  review: 'En revisión',
};

function dateLabel(value: string | null | undefined) {
  if (!value) return 'Sin fecha';
  // A calendar date from Laudus is not a UTC timestamp. Otherwise Santiago
  // displays the previous day for values such as "2026-11-22".
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(value + 'T00:00:00Z'));
  }
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value));
}

function timeLabel(value: string | null | undefined) {
  if (!value) return 'Sin sincronización';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value));
}

export default function BodegaMaintenanceSupplyPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/bodega/maintenance-supply', fetcher, { revalidateOnFocus: false });
  const [showHistorical, setShowHistorical] = useState(false);
  const { ready: accessReady, canView } = useModuleAccess();
  const canOpenOrders = accessReady && canView('mant_operaciones');

  const sourceAuthority = data?.sourceAuthority;
  const rows = data?.rows || [];
  const activeRows = rows.filter((row) => !isHistoricalOrder(row.workOrderStatus));
  const historicalRows = rows.filter((row) => isHistoricalOrder(row.workOrderStatus));
  const visibleRows = showHistorical ? [...activeRows, ...historicalRows] : activeRows;
  const authorityCurrent = sourceAuthority?.authority_state === 'laudus_primary';

  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Bodega · Mantención</PageHeaderEyebrow>
        <PageHeaderTitle>Materiales de OT</PageHeaderTitle>
        <PageHeaderDescription>Consulta materiales registrados en órdenes de trabajo y compáralos con Bodega Central (002). Esta vista no modifica entregas ni existencias.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        {canOpenOrders ? <Button asChild variant="outline"><Link href="/dashboard/mantenimiento/ordenes-trabajo">Ver órdenes de trabajo</Link></Button> : null}
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4" />Actualizar</Button>
      </PageHeaderActions>
    </PageHeader>

    <section className="grid gap-3 md:grid-cols-2">
      <div className="rounded-lg border bg-card p-4">
        <div className="flex items-center gap-2"><Boxes className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Fuente de stock</p></div>
        <p className="mt-2 font-medium">{authorityCurrent ? 'Laudus como referencia de validación' : 'Corte Laudus en revisión'}</p>
        <p className="mt-1 text-sm text-muted-foreground">{sourceAuthority?.authority_reason || 'La autoridad de stock no está confirmada.'}</p>
        <p className="mt-2 text-xs text-muted-foreground">Corte: {dateLabel(sourceAuthority?.latest_laudus_stock_date)} · Sincronizado: {timeLabel(sourceAuthority?.latest_laudus_stock_sync)}</p>
      </div>
      <div className="rounded-lg border bg-muted/20 p-4">
        <div className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-muted-foreground" /><p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Cómo leer las cantidades</p></div>
        <p className="mt-2 text-sm">El corte Laudus sirve para validar la cantidad que se dejará registrada en el inventario canónico de MOTIL. La vista compara totales por producto y no confirma una reserva ni una ubicación física.</p>
        <p className="mt-1 text-xs text-muted-foreground">Esta etapa es de consulta: todavía no importa ni reemplaza saldos. Las acciones operacionales de MOTIL siguen funcionando sin bloqueo.</p>
      </div>
    </section>

    {error ? <StatePanel title="No se pudo cargar la relación" description={error.message} /> : null}
    {isLoading ? <StatePanel title="Cargando materiales de OT" description="Consultando requerimientos y la fuente de stock." /> : null}
    {!isLoading && !error && rows.length === 0 ? <StatePanel title="Aún no hay materiales registrados para estas OT" description="Abre una OT vigente y registra sus materiales necesarios. No se crean solicitudes automáticamente." /> : null}
    {!isLoading && !error && rows.length > 0 && activeRows.length === 0 ? (
      <StatePanel title="Sin materiales solicitados en OT activas" description="Los materiales registrados pertenecen a OT finalizadas. Para nuevas solicitudes, Planificación debe registrar los materiales en una OT vigente; el historial no representa entregas pendientes." actions={canOpenOrders ? <Button asChild variant="outline" size="sm"><Link href="/dashboard/mantenimiento/ordenes-trabajo">Revisar OT activas</Link></Button> : undefined} />
    ) : null}

    {!isLoading && !error && rows.length > 0 ? <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-semibold">Materiales solicitados · OT activas</h2>
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant="outline">{activeRows.length} actuales</Badge>
          {historicalRows.length > 0 ? (
            <Button type="button" size="sm" variant="outline" onClick={() => setShowHistorical((current) => !current)}>
              {showHistorical ? 'Ocultar historial' : `Ver ${historicalRows.length} históricos`}
            </Button>
          ) : null}
        </div>
      </div>
      {visibleRows.map((row) => {
        const historical = isHistoricalOrder(row.workOrderStatus);
        const stateLabel = reconciliationLabel[row.stockReconciliationState] || 'Revisar fuente';
        return <article key={row.requirementId} className="rounded-lg border bg-card p-4">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-semibold">{row.workOrderNumber || 'OT sin folio'}</p>
                <Badge variant={historical ? 'outline' : 'secondary'}>{historical ? 'Histórica' : (row.workOrderStatus || 'Estado sin dato')}</Badge>
                {row.priority ? <Badge variant="outline">{row.priority}</Badge> : null}
              </div>
              <p className="mt-1 text-sm text-muted-foreground">{row.workOrderTitle || 'Sin título de OT'} · {row.productCode || 'Sin código'} · {row.productName || 'Producto sin nombre'}</p>
            </div>
            <Badge variant={row.stockReconciliationState === 'aligned' ? 'secondary' : 'outline'}>{stateLabel}</Badge>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Cantidad solicitada</p><p className="mt-1 font-medium">{quantity(row.quantityRequired, row.unit)}</p></div>
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Existencia observada · Laudus Central (002)</p><p className="mt-1 font-medium">{quantity(row.observedLaudusQuantity, row.unit)}</p></div>
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Estado del requerimiento</p><p className="mt-1 font-medium">{row.requirementStatus === 'procurement_needed' ? 'Compra por revisar' : row.requirementStatus === 'fulfilled' ? 'Atendido' : row.requirementStatus === 'pending' ? 'Pendiente de revisión' : 'Estado sin confirmar'}</p></div>
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Último dato de stock</p><p className="mt-1 font-medium">{timeLabel(row.stockSyncedAt)}</p></div>
          </div>
          {historical ? <p className="mt-3 text-xs text-muted-foreground">Requerimiento asociado a una OT histórica; se muestra para conciliación y no se presenta como trabajo pendiente.</p> : null}
          {row.notes ? <p className="mt-3 text-sm text-muted-foreground">{row.notes}</p> : null}
        </article>;
      })}
    </div> : null}
  </div>;
}
