'use client';

import useSWR from 'swr';
import Link from 'next/link';
import { AlertTriangle, ArrowLeft, Boxes, RefreshCw } from 'lucide-react';
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
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeZone: 'America/Santiago' }).format(new Date(value));
}

function timeLabel(value: string | null | undefined) {
  if (!value) return 'Sin sincronización';
  return new Intl.DateTimeFormat('es-CL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value));
}

export default function BodegaMaintenanceSupplyPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/bodega/maintenance-supply', fetcher, { revalidateOnFocus: false });

  const sourceAuthority = data?.sourceAuthority;
  const rows = data?.rows || [];
  const authorityCurrent = sourceAuthority?.authority_state === 'laudus_primary';

  return <div className="space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Bodega · Mantención</PageHeaderEyebrow>
        <PageHeaderTitle>Materiales vinculados a OT</PageHeaderTitle>
        <PageHeaderDescription>Compara materiales requeridos por OT con el corte de Laudus de Bodega Central (002) para validar la transición hacia stock canónico mantenido por MOTIL.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button asChild variant="outline"><Link href="/dashboard/bodega"><ArrowLeft className="h-4 w-4" />Volver a Bodega</Link></Button>
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
    {!isLoading && !error && rows.length === 0 ? <StatePanel title="No hay requerimientos de materiales registrados" description="Las OT aparecerán aquí cuando Mantención registre materiales requeridos." /> : null}

    {!isLoading && !error && rows.length > 0 ? <div className="space-y-3">
      <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Requerimientos encontrados</h2><Badge variant="outline">{rows.length} líneas</Badge></div>
      {rows.map((row) => {
        const historical = ['completed', 'closed', 'cancelled', 'canceled'].includes(String(row.workOrderStatus || '').toLowerCase());
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
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Estado del requerimiento</p><p className="mt-1 font-medium">{row.requirementStatus || 'Sin estado'}</p></div>
            <div className="rounded-md bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Último dato de stock</p><p className="mt-1 font-medium">{timeLabel(row.stockSyncedAt)}</p></div>
          </div>
          {historical ? <p className="mt-3 text-xs text-muted-foreground">Requerimiento asociado a una OT histórica; se muestra para conciliación y no se presenta como trabajo pendiente.</p> : null}
          {row.notes ? <p className="mt-3 text-sm text-muted-foreground">{row.notes}</p> : null}
        </article>;
      })}
    </div> : null}
  </div>;
}
