'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertCircle, CheckCircle2, PackageSearch, RefreshCw, RotateCcw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la información');
  return payload;
};

type StockItem = {
  id: string;
  part_code: string;
  part_name: string;
  quantity_on_hand?: number;
  quantity_reserved?: number;
  quantity_available?: number;
  reorder_level?: number;
  unit_cost?: number;
  bin?: { bin_code?: string; bin_location?: string } | null;
};

type DeliveredPart = {
  id: string;
  canonical_product_id?: string | null;
  quantity: number;
  quantity_reserved?: number;
  quantity_issued?: number;
  quantity_installed?: number;
  quantity_returned?: number;
  unit_cost?: number;
  status?: string;
  part?: {
    part_code?: string;
    product_code?: string;
    part_name?: string;
    name?: string;
  };
};

type MovementRow = {
  id: string;
  movement_type?: string;
  quantity?: number;
  notes?: string;
  created_at?: string;
  canonical_product_id?: string | null;
  reference_doc?: string | null;
  reference_id?: string | null;
  stock?: { part_code?: string; part_name?: string };
};

type CostSummary = {
  parts?: number;
  labor?: number;
  external?: number;
  total?: number;
  pendingParts?: number;
  openLaborEntries?: number;
};

function money(value: number) {
  return `$${Number(value || 0).toLocaleString('es-CL')}`;
}

function movementLabel(value?: string) {
  const labels: Record<string, string> = {
    issue: 'Entregado a mantenimiento',
    issued: 'Entregado a mantenimiento',
    return: 'Devuelto a bodega',
    receipt: 'Recibido en bodega',
    receive: 'Recibido en bodega',
    adjustment: 'Ajuste de inventario',
    transfer: 'Traslado interno',
  };
  return labels[String(value || '').toLowerCase()] || 'Movimiento de inventario';
}

export function WorkOrderPartsPanel({ workOrderId }: { workOrderId: string }) {
  const [query, setQuery] = useState('');
  const [selectedPartId, setSelectedPartId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [workingId, setWorkingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const { data: stockData, error: stockError, isLoading: stockLoading, mutate: mutateStock } = useSWR('/api/warehouse/stock', fetcher);
  const { data, error, isLoading, mutate } = useSWR(
    workOrderId ? `/api/maintenance/work-orders/${workOrderId}/reserve-parts` : null,
    fetcher,
  );

  const stockItems = Array.isArray(stockData?.stock) ? (stockData.stock as StockItem[]) : [];
  const deliveredParts = Array.isArray(data?.reservedParts) ? (data.reservedParts as DeliveredPart[]) : [];
  const movements = Array.isArray(data?.movements) ? (data.movements as MovementRow[]) : [];
  const totals = data?.totals || {};
  const costs = (data?.costSummary || {}) as CostSummary;

  const filteredStock = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return stockItems;
    return stockItems.filter((item) =>
      [item.part_code, item.part_name, item.bin?.bin_code, item.bin?.bin_location]
        .map((value) => String(value || '').toLowerCase())
        .join(' ')
        .includes(term),
    );
  }, [query, stockItems]);

  const reservedUnits = deliveredParts.reduce((sum, part) => sum + (part.status === 'reserved' ? Number(part.quantity_reserved || 0) : 0), 0);
  const reservedLines = deliveredParts.filter((part) => part.status === 'reserved' && Number(part.quantity_reserved || 0) > 0).length;
  const purchaseReceivedProducts = new Set(movements.filter((movement) => movement.movement_type === 'receipt' && movement.reference_doc === 'operational_receipt' && movement.canonical_product_id).map((movement) => String(movement.canonical_product_id)));
  const purchaseReservedUnits = deliveredParts.reduce((sum, part) => sum + (part.status === 'reserved' && part.canonical_product_id && purchaseReceivedProducts.has(part.canonical_product_id) ? Number(part.quantity_reserved || 0) : 0), 0);
  const selectedPart = stockItems.find((item) => item.id === selectedPartId);
  const selectedAvailable = Number(
    selectedPart?.quantity_available ??
      Math.max(0, Number(selectedPart?.quantity_on_hand || 0) - Number(selectedPart?.quantity_reserved || 0)),
  );

  const refreshAll = async () => Promise.all([mutateStock(), mutate()]);

  const deliver = async () => {
    if (!selectedPartId || !Number.isInteger(quantity) || quantity <= 0) {
      setErrorMessage('Selecciona un repuesto y una cantidad entera mayor que cero.');
      return;
    }
    if (quantity > selectedAvailable) {
      setErrorMessage(`Solo hay ${selectedAvailable} unidades disponibles.`);
      return;
    }
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/reserve-parts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ partId: selectedPartId, quantity }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo entregar el repuesto');
      setSelectedPartId('');
      setQuantity(1);
      await refreshAll();
    } catch (actionError) {
      setErrorMessage(actionError instanceof Error ? actionError.message : 'No se pudo entregar el repuesto');
    } finally {
      setSubmitting(false);
    }
  };

  const issueReserved = async () => {
    if (reservedUnits <= 0) return;
    setSubmitting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/issue-materials`, {
        method: 'POST',
        credentials: 'include',
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudieron entregar las reservas a la OT');
      await refreshAll();
    } catch (actionError) {
      setErrorMessage(actionError instanceof Error ? actionError.message : 'No se pudieron entregar las reservas a la OT');
    } finally {
      setSubmitting(false);
    }
  };

  const updatePart = async (part: DeliveredPart, action: 'install' | 'return') => {
    const issued = Number(part.quantity_issued || part.quantity || 0);
    const installed = Number(part.quantity_installed || 0);
    const returned = Number(part.quantity_returned || 0);
    const pending = Math.max(0, issued - installed - returned);
    if (pending <= 0) return;

    setWorkingId(`${action}-${part.id}`);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/reserve-parts`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ action, partRecordId: part.id, quantity: pending }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo actualizar el repuesto');
      await refreshAll();
    } catch (actionError) {
      setErrorMessage(actionError instanceof Error ? actionError.message : 'No se pudo actualizar el repuesto');
    } finally {
      setWorkingId(null);
    }
  };

  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <PackageSearch className="h-4 w-4" />
          Repuestos y costo de la orden
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Repuestos instalados</p><p className="mt-1 text-xl font-semibold">{Number(totals.installed || 0)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Pendientes de confirmar</p><p className="mt-1 text-xl font-semibold">{Number(costs.pendingParts || 0)}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Repuestos utilizados</p><p className="mt-1 text-xl font-semibold">{money(Number(costs.parts || 0))}</p></div>
          <div className="rounded-lg border bg-muted/30 p-3"><p className="text-xs text-muted-foreground">Costo total registrado</p><p className="mt-1 text-xl font-semibold">{money(Number(costs.total || 0))}</p></div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Mano de obra</p><p className="mt-1 font-medium">{money(Number(costs.labor || 0))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Servicios externos</p><p className="mt-1 font-medium">{money(Number(costs.external || 0))}</p></div>
          <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Registros de trabajo abiertos</p><p className="mt-1 font-medium">{Number(costs.openLaborEntries || 0)}</p></div>
        </div>

        {reservedUnits > 0 ? <section className="rounded-lg border border-primary/30 bg-primary/5 p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-medium">Material reservado para esta OT</p>
              <p className="mt-1 text-xs text-muted-foreground">{reservedLines} línea(s) · {reservedUnits} unidad(es). {purchaseReservedUnits > 0 ? `${purchaseReservedUnits} unidad(es) provienen de una recepción de compra vinculada a esta OT. ` : ''}Falta confirmar la entrega al ejecutor.</p>
            </div>
            <Button onClick={() => void issueReserved()} disabled={submitting}>
              {submitting ? 'Entregando…' : 'Entregar reservas a la OT'}
            </Button>
          </div>
        </section> : null}

        <section className="space-y-4 rounded-lg border p-4">
          <div><h3 className="font-medium">Entregar desde bodega</h3><p className="mt-1 text-sm text-muted-foreground">La entrega descuenta existencias y queda vinculada a esta orden. Si el repuesto llegó por una compra de esta OT, usa primero la reserva automática de arriba.</p></div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-2"><Label htmlFor={`part-search-${workOrderId}`}>Buscar repuesto</Label><Input id={`part-search-${workOrderId}`} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Código, nombre o ubicación" /></div>
            <div className="space-y-2"><Label htmlFor={`part-quantity-${workOrderId}`}>Cantidad a entregar</Label><Input id={`part-quantity-${workOrderId}`} type="number" min={1} step={1} value={quantity} onChange={(event) => setQuantity(Number(event.target.value || 1))} /></div>
          </div>
          <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
            {stockLoading ? <p className="text-sm text-muted-foreground">Cargando existencias…</p> : stockError ? <p className="text-sm text-destructive">No se pudieron cargar las existencias.</p> : filteredStock.length === 0 ? <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><Search className="h-4 w-4" />No hay repuestos con ese filtro.</div> : filteredStock.map((item) => {
              const available = Number(item.quantity_available ?? Math.max(0, Number(item.quantity_on_hand || 0) - Number(item.quantity_reserved || 0)));
              return <button key={item.id} type="button" onClick={() => setSelectedPartId(item.id)} disabled={available <= 0} className={`w-full rounded-lg border p-3 text-left transition-colors disabled:opacity-50 ${selectedPartId === item.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}><div className="flex items-center justify-between gap-3"><div><p className="font-medium">{item.part_name}</p><p className="text-xs text-muted-foreground">{item.part_code} · {item.bin?.bin_location || 'Sin ubicación'}</p></div><Badge variant={available <= 0 ? 'outline' : 'secondary'}>{available} disponibles</Badge></div></button>;
            })}
          </div>
          <div className="flex flex-wrap items-center gap-3"><Button onClick={deliver} disabled={submitting || !selectedPartId}>{submitting ? 'Entregando…' : 'Entregar a la orden'}</Button><Button variant="outline" onClick={() => void refreshAll()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>{selectedPart ? <span className="text-sm text-muted-foreground">{selectedPart.part_name}</span> : null}</div>
        </section>

        {errorMessage ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{errorMessage}</div> : null}

        <section className="space-y-3">
          <h3 className="text-sm font-semibold">Repuestos entregados</h3>
          {isLoading ? <p className="text-sm text-muted-foreground">Cargando…</p> : error ? <p className="text-sm text-destructive">No se pudo cargar la información.</p> : deliveredParts.length === 0 ? <div className="flex items-center gap-2 rounded-lg border border-dashed p-4 text-sm text-muted-foreground"><AlertCircle className="h-4 w-4" />Aún no hay repuestos entregados.</div> : deliveredParts.map((part) => {
            const reserved = Number(part.quantity_reserved || 0);
            const issued = Number(part.quantity_issued || part.quantity || 0);
            const installed = Number(part.quantity_installed || 0);
            const returned = Number(part.quantity_returned || 0);
            const pending = Math.max(0, issued - installed - returned);
            const name = part.part?.part_name || part.part?.name || 'Repuesto';
            const code = part.part?.part_code || part.part?.product_code || 'Sin código';
            return <div key={part.id} className="rounded-lg border p-4"><div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between"><div><div className="flex flex-wrap items-center gap-2"><p className="font-medium">{name}</p><Badge variant="outline">{code}</Badge>{reserved > 0 ? <Badge variant="outline">{reserved} reservado{reserved === 1 ? '' : 's'}</Badge> : pending === 0 ? <Badge variant="secondary">Confirmado</Badge> : <Badge variant="outline">{pending} pendiente{pending === 1 ? '' : 's'}</Badge>}</div><p className="mt-2 text-sm text-muted-foreground">Reservado: {reserved} · Entregado: {issued} · Instalado: {installed} · Devuelto: {returned}</p><p className="mt-1 text-sm">Costo utilizado: {money(installed * Number(part.unit_cost || 0))}</p></div>{pending > 0 ? <div className="flex flex-wrap gap-2"><Button size="sm" onClick={() => void updatePart(part, 'install')} disabled={workingId !== null}><CheckCircle2 className="mr-2 h-4 w-4" />{workingId === `install-${part.id}` ? 'Confirmando…' : 'Confirmar instalación'}</Button><Button size="sm" variant="outline" onClick={() => void updatePart(part, 'return')} disabled={workingId !== null}><RotateCcw className="mr-2 h-4 w-4" />{workingId === `return-${part.id}` ? 'Devolviendo…' : 'Devolver a bodega'}</Button></div> : null}</div></div>;
          })}
        </section>

        <section className="space-y-3"><h3 className="text-sm font-semibold">Movimientos relacionados</h3>{movements.length === 0 ? <p className="text-sm text-muted-foreground">Todavía no hay movimientos registrados.</p> : movements.map((movement) => <div key={movement.id} className="flex flex-col justify-between gap-2 rounded-lg border p-3 text-sm sm:flex-row"><div><p className="font-medium">{movement.stock?.part_name || 'Repuesto'}</p><p className="text-muted-foreground">{movementLabel(movement.movement_type)}{movement.notes ? ` · ${movement.notes}` : ''}</p></div><div className="text-right"><Badge variant="outline">{Number(movement.quantity || 0)}</Badge><p className="mt-1 text-xs text-muted-foreground">{movement.created_at ? new Date(movement.created_at).toLocaleString('es-CL') : 'Sin fecha'}</p></div></div>)}</section>
      </CardContent>
    </Card>
  );
}
