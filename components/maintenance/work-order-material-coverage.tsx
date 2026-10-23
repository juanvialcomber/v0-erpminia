'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, PackageCheck, PackageSearch, Plus, ShoppingCart, X } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar la cobertura de materiales');
  return payload;
};

type MaterialRow = {
  requirement_id?: string | null;
  product_id?: string | null;
  product_code?: string | null;
  product_name?: string | null;
  required?: number | string | null;
  available?: number | string | null;
  reserved?: number | string | null;
  issued?: number | string | null;
  in_procurement?: number | string | null;
  shortage?: number | string | null;
  status?: string | null;
  id?: string | null;
  quantity_required?: number | string | null;
  quantity_available?: number | string | null;
  quantity_shortage?: number | string | null;
};

type CatalogRow = {
  productId: string;
  productCode: string | null;
  productName: string | null;
  family: string | null;
  unit: string | null;
  quantityAvailable: number;
  warehouses: string[];
};

type SupplyStatus = {
  supply_need_id?: string | null;
  procurement_request_id?: string | null;
  supply_status?: string | null;
  materials?: MaterialRow[] | null;
};

const required = (row: MaterialRow) => Number(row.required ?? row.quantity_required ?? 0);
const available = (row: MaterialRow) => Number(row.available ?? row.quantity_available ?? 0);
const issued = (row: MaterialRow) => Number(row.issued ?? 0);
const reserved = (row: MaterialRow) => Number(row.reserved ?? Math.max(available(row) - issued(row), 0));
const inProcurement = (row: MaterialRow) => Number(row.in_procurement ?? 0);
const shortage = (row: MaterialRow) => Number(row.shortage ?? row.quantity_shortage ?? 0);
const rowKey = (row: MaterialRow) => row.requirement_id || row.id || row.product_id || `${row.product_code}-${row.product_name}`;

export function WorkOrderMaterialCoverage({ workOrderId, executionMode = false }: { workOrderId: string; executionMode?: boolean }) {
  const { data, error, isLoading, mutate } = useSWR(`/api/maintenance/work-orders/${workOrderId}/materials`, fetcher);
  const [issuing, setIssuing] = useState(false);
  const [sending, setSending] = useState(false);
  const [saving, setSaving] = useState(false);
  const [adding, setAdding] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<CatalogRow | null>(null);
  const [quantity, setQuantity] = useState('1');
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [declaring, setDeclaring] = useState(false);

  const status = (data?.data || data || {}) as SupplyStatus;
  const materialDeclaration = data?.materialDeclaration || null;
  const requiresMaterials = materialDeclaration?.requiresMaterials as boolean | null | undefined;
  const rows = Array.isArray(status.materials) ? status.materials : [];
  const shortageCount = rows.filter((row) => shortage(row) > 0).length;
  const reservedTotal = rows.reduce((sum, row) => sum + reserved(row), 0);
  const issuedTotal = rows.reduce((sum, row) => sum + issued(row), 0);
  const requiredTotal = rows.reduce((sum, row) => sum + required(row), 0);
  const shortageTotal = rows.reduce((sum, row) => sum + shortage(row), 0);
  const procurementTotal = rows.reduce((sum, row) => sum + inProcurement(row), 0);
  const alreadySent = Boolean(status.procurement_request_id) || ['sent_to_procurement', 'partially_covered', 'covered'].includes(status.supply_status || '');
  const catalogKey = query.trim().length >= 2 ? `/api/maintenance/material-catalog?q=${encodeURIComponent(query.trim())}` : null;
  const { data: catalogData, isLoading: catalogLoading } = useSWR<{ rows: CatalogRow[] }>(catalogKey, fetcher, { revalidateOnFocus: false });
  const catalogRows = useMemo(() => (catalogData?.rows || []).filter((item) => !rows.some((row) => row.product_id === item.productId)), [catalogData, rows]);

  const declareMaterials = async (value: boolean) => {
    setDeclaring(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/materials`, {
        method: 'PATCH',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requiresMaterials: value }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la declaración.');
      setActionMessage(value ? 'OT marcada con uso de materiales.' : 'OT confirmada sin materiales.');
      if (value) setAdding(true);
      await mutate();
    } catch (declareError) {
      setActionError(declareError instanceof Error ? declareError.message : 'No se pudo guardar la declaración.');
    } finally {
      setDeclaring(false);
    }
  };

  const resetEditor = () => {
    setAdding(false);
    setQuery('');
    setSelected(null);
    setQuantity('1');
  };

  const addMaterial = async () => {
    const requested = Number(quantity);
    if (!selected || !Number.isFinite(requested) || requested <= 0) return;
    setSaving(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/materials`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canonicalProductId: selected.productId, quantityRequired: requested }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo agregar el material');
      setActionMessage(`${selected.productCode || selected.productName || 'Material'} agregado al requerimiento.`);
      resetEditor();
      await mutate();
    } catch (saveError) {
      setActionError(saveError instanceof Error ? saveError.message : 'No se pudo agregar el material');
    } finally {
      setSaving(false);
    }
  };

  const issueAvailable = async () => {
    setIssuing(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${workOrderId}/issue-materials`, { method: 'POST', credentials: 'include' });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudieron entregar los materiales');
      setActionMessage('Las reservas fueron entregadas a la orden.');
      await mutate();
    } catch (issueError) {
      setActionError(issueError instanceof Error ? issueError.message : 'No se pudieron entregar los materiales');
    } finally {
      setIssuing(false);
    }
  };

  const sendShortagesToPurchasing = async () => {
    if (!status.supply_need_id) return;
    setSending(true);
    setActionError(null);
    setActionMessage(null);
    try {
      const response = await fetch('/api/procurement/supply-needs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ supplyNeedId: status.supply_need_id }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo enviar la solicitud a Compras');
      setActionMessage('Los faltantes fueron enviados a Compras sin volver a ingresar la información.');
      await mutate();
    } catch (sendError) {
      setActionError(sendError instanceof Error ? sendError.message : 'No se pudo enviar la solicitud a Compras');
    } finally {
      setSending(false);
    }
  };

  const primaryAction = requiresMaterials === false
    ? { title: 'OT confirmada sin materiales', detail: 'No se esperan repuestos ni consumos para esta intervención.', action: 'none' as const }
    : rows.length === 0
      ? { title: 'Define los materiales de la OT', detail: 'Agrega el primer producto requerido; MOTIL reservará automáticamente el stock disponible.', action: 'add' as const }
    : reservedTotal > 0
      ? executionMode
        ? { title: 'Material reservado en Bodega', detail: `${reservedTotal} unidad(es) están reservadas; Bodega o supervisión debe registrar la entrega.`, action: 'reserved' as const }
        : { title: 'Hay material reservado para entregar', detail: `${reservedTotal} unidad(es) ya están aseguradas para esta OT.`, action: 'issue' as const }
      : shortageTotal > 0 && !alreadySent
        ? executionMode
          ? { title: 'Faltante detectado', detail: `${shortageTotal} unidad(es) requieren gestión de Compras.`, action: 'needs_procurement' as const }
          : { title: 'Hay faltantes que requieren Compras', detail: `${shortageTotal} unidad(es) no tienen cobertura reservada ni entregada.`, action: 'procure' as const }
        : shortageTotal > 0
          ? { title: 'Compras está gestionando los faltantes', detail: `${procurementTotal || shortageTotal} unidad(es) están registradas en el flujo de abastecimiento.`, action: 'waiting' as const }
          : { title: 'Materiales listos para ejecución', detail: `${issuedTotal} de ${requiredTotal} unidad(es) requeridas ya fueron entregadas.`, action: 'ready' as const };

  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Materiales de la OT</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Una sola secuencia: requerir → reservar → entregar → comprar faltantes.</p>
          </div>
          {requiresMaterials === false ? <Badge variant="outline">Sin materiales</Badge> : rows.length > 0 ? <Badge variant={shortageCount > 0 ? 'destructive' : 'secondary'}>{shortageCount > 0 ? `${shortageCount} línea(s) con faltante` : 'Cobertura completa'}</Badge> : <Badge variant="outline">{requiresMaterials === true ? 'Materiales pendientes' : 'Sin revisar'}</Badge>}
        </div>

        {requiresMaterials == null ? <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Declaración necesaria</p>
          <p className="mt-2 font-medium">¿Esta OT utilizará repuestos o materiales?</p>
          <p className="mt-1 text-sm text-muted-foreground">Esta respuesta permite distinguir una OT sin consumo de una OT donde falta registrar materiales.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" onClick={() => void declareMaterials(true)} disabled={declaring}>Sí, agregar materiales</Button>
            <Button size="sm" variant="outline" onClick={() => void declareMaterials(false)} disabled={declaring}>No requiere materiales</Button>
          </div>
        </div> : null}

        {requiresMaterials != null ? <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente acción</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{primaryAction.title}</p><p className="mt-1 text-sm text-muted-foreground">{primaryAction.detail}</p></div>
            {primaryAction.action === 'add' ? <Button size="sm" onClick={() => setAdding(true)} disabled={saving || issuing || sending}><Plus className="mr-2 h-4 w-4" />Agregar material</Button> : null}
            {primaryAction.action === 'issue' ? <Button size="sm" onClick={issueAvailable} disabled={issuing || sending || saving}><PackageCheck className="mr-2 h-4 w-4" />{issuing ? 'Entregando…' : 'Entregar reservas'}</Button> : null}
            {primaryAction.action === 'procure' ? <Button size="sm" onClick={sendShortagesToPurchasing} disabled={sending || issuing || saving || !status.supply_need_id}><ShoppingCart className="mr-2 h-4 w-4" />{sending ? 'Enviando…' : 'Enviar a Compras'}</Button> : null}
            {primaryAction.action === 'reserved' ? <Badge variant="secondary">Reserva lista</Badge> : null}
            {primaryAction.action === 'needs_procurement' ? <Badge variant="outline">Compras debe gestionar</Badge> : null}
            {primaryAction.action === 'waiting' ? <Badge variant="secondary">En Compras</Badge> : null}
            {primaryAction.action === 'ready' ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Listo</Badge> : null}
          </div>
        </div> : null}
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}
        {actionMessage ? <div className="rounded-lg border bg-muted/40 p-3 text-sm">{actionMessage}</div> : null}

        {rows.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[['Requerido', requiredTotal], ['Reservado', reservedTotal], ['Entregado', issuedTotal], ['Faltante', shortageTotal], ['En Compras', procurementTotal]].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
        </div> : null}

        {requiresMaterials === true ? <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setAdding((value) => !value)} disabled={saving || issuing || sending}>{adding ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{adding ? 'Cerrar' : 'Agregar otro material'}</Button></div> : null}

        {adding ? <div className="rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-end">
            <div className="space-y-2"><p className="text-xs font-medium">Buscar producto canónico</p><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Código o nombre, mínimo 2 caracteres" /></div>
            <div className="space-y-2"><p className="text-xs font-medium">Cantidad</p><Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
            <Button onClick={addMaterial} disabled={!selected || saving || Number(quantity) <= 0}>{saving ? 'Guardando…' : 'Agregar'}</Button>
          </div>
          {selected ? <div className="mt-3 rounded-md border bg-card p-3 text-sm"><p className="font-medium">{selected.productCode || 'Sin código'} · {selected.productName}</p><p className="mt-1 text-xs text-muted-foreground">Stock libre informado: {selected.quantityAvailable} {selected.unit || 'unid.'} · {selected.warehouses.length ? selected.warehouses.join(', ') : 'sin bodega informada'}</p><p className="mt-2 text-xs text-muted-foreground">La reserva de OT trabaja hoy con cantidades enteras; MOTIL no redondea fracciones automáticamente.</p></div> : null}
          {!selected && query.trim().length >= 2 ? <div className="mt-3 max-h-56 overflow-auto rounded-md border bg-card">
            {catalogLoading ? <p className="p-3 text-sm text-muted-foreground">Buscando…</p> : catalogRows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sin coincidencias disponibles.</p> : catalogRows.map((item) => <button key={item.productId} type="button" onClick={() => setSelected(item)} className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"><p className="text-sm font-medium">{item.productCode || 'Sin código'} · {item.productName}</p><p className="mt-0.5 text-xs text-muted-foreground">Stock libre {item.quantityAvailable} {item.unit || 'unid.'}{item.family ? ` · ${item.family}` : ''}</p></button>)}
          </div> : null}
        </div> : null}

        {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
        {!isLoading && !error && requiresMaterials === true && rows.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"><PackageSearch className="mx-auto mb-2 h-5 w-5" />La OT usa materiales, pero aún no se han definido productos requeridos.</div> : null}
        {!isLoading && !error && requiresMaterials === false ? <div className="flex items-center justify-between gap-3 rounded-lg border border-dashed p-4 text-sm"><span className="text-muted-foreground">Declaración guardada: esta OT no requiere materiales.</span><Button size="sm" variant="ghost" onClick={() => void declareMaterials(true)} disabled={declaring}>Cambiar</Button></div> : null}
        {rows.length > 0 ? <div className="divide-y rounded-lg border">{rows.map((row) => {
          const missing = shortage(row);
          const reservedQty = reserved(row);
          const issuedQty = issued(row);
          const purchasingQty = inProcurement(row);
          return <div key={String(rowKey(row))} className="p-4">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0"><p className="truncate font-medium">{row.product_name || 'Producto'}</p><p className="text-xs text-muted-foreground">{row.product_code || 'Sin código'}</p></div>{missing > 0 ? <AlertTriangle className="mt-1 h-4 w-4 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-muted-foreground" />}</div>
            <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
              <div><p className="text-xs text-muted-foreground">Requerido</p><p className="font-medium tabular-nums">{required(row)}</p></div>
              <div><p className="text-xs text-muted-foreground">Reservado</p><p className="font-medium tabular-nums">{reservedQty}</p></div>
              <div><p className="text-xs text-muted-foreground">Entregado</p><p className="font-medium tabular-nums">{issuedQty}</p></div>
              <div><p className="text-xs text-muted-foreground">Faltante</p><p className={missing > 0 ? 'font-semibold tabular-nums text-destructive' : 'font-medium tabular-nums'}>{missing}</p></div>
              <div><p className="text-xs text-muted-foreground">En Compras</p><p className="font-medium tabular-nums">{purchasingQty}</p></div>
            </div>
          </div>;
        })}</div> : null}
      </CardContent>
    </Card>
  );
}
