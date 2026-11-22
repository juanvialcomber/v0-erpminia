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
  observedLaudusQuantity: number | null;
  stockReconciliationState: string;
  stockSyncedAt: string | null;
};

type SupplyStatus = {
  supply_need_id?: string | null;
  procurement_request_id?: string | null;
  supply_status?: string | null;
  materials?: MaterialRow[] | null;
};

const required = (row: MaterialRow) => Number(row.required ?? row.quantity_required ?? 0);
const issued = (row: MaterialRow) => Number(row.issued ?? 0);
const reserved = (row: MaterialRow) => Number(row.reserved ?? 0);
const inProcurement = (row: MaterialRow) => Number(row.in_procurement ?? 0);
const shortage = (row: MaterialRow) => Number(row.shortage ?? row.quantity_shortage ?? 0);
const rowKey = (row: MaterialRow) => row.requirement_id || row.id || row.product_id || `${row.product_code}-${row.product_name}`;

function laudusReferenceLabel(item: CatalogRow) {
  if (item.stockReconciliationState === 'source_unavailable') return 'No se pudo consultar el corte de Laudus.';
  if (item.stockReconciliationState === 'review_identity_conflict') return 'Identidad en revisión; no hay saldo confiable.';
  if (item.observedLaudusQuantity === null) return 'Sin saldo Laudus Central vinculado.';
  const quantity = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 6 }).format(item.observedLaudusQuantity);
  return `Laudus Central (002): ${quantity} ${item.unit || ''} · sin verificar físicamente.`;
}

export function WorkOrderMaterialCoverage({ workOrderId }: { workOrderId: string }) {
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

  const status = (data?.data || data || {}) as SupplyStatus;
  const rows = Array.isArray(status.materials) ? status.materials : [];
  // Quantities are comparable only within a product/SKU. Summing units,
  // kilograms, metres and litres across different lines is not meaningful.
  const shortageCount = rows.filter((row) => shortage(row) > 0).length;
  const reservedLines = rows.filter((row) => reserved(row) > 0).length;
  const issuedLines = rows.filter((row) => issued(row) > 0).length;
  const procurementLines = rows.filter((row) => inProcurement(row) > 0).length;
  const fullyDelivered = rows.length > 0 &&
    rows.every((row) => required(row) > 0 && issued(row) >= required(row));
  const coveredLines = rows.filter((row) =>
    required(row) > 0 && (reserved(row) + issued(row)) >= required(row),
  ).length;
  const alreadySent = Boolean(status.procurement_request_id) || ['sent_to_procurement', 'partially_covered', 'covered'].includes(status.supply_status || '');
  const catalogKey = query.trim().length >= 2 ? `/api/maintenance/material-catalog?q=${encodeURIComponent(query.trim())}` : null;
  const { data: catalogData, error: catalogError, isLoading: catalogLoading } = useSWR<{ rows: CatalogRow[]; stockEvidenceAvailable: boolean }>(
    catalogKey, fetcher, { revalidateOnFocus: false },
  );
  const catalogRows = useMemo(() => (catalogData?.rows || []).filter((item) => !rows.some((row) => row.product_id === item.productId)), [catalogData, rows]);

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

  const primaryAction = rows.length === 0
    ? { title: 'Sin materiales registrados', detail: 'La gestión de Bodega es opcional: puedes continuar esta OT y registrar materiales solo cuando corresponda.', action: 'optional' as const }
    : reservedLines > 0
      ? { title: 'Hay materiales reservados para entregar', detail: `${reservedLines} línea(s) con reserva registrada para esta OT.`, action: 'issue' as const }
      : shortageCount > 0 && !alreadySent
        ? { title: 'Faltantes sin cobertura registrada', detail: `${shortageCount} línea(s) a revisar. Puedes solicitar apoyo a Compras sin detener la OT.`, action: 'procure' as const }
        : shortageCount > 0
          ? { title: 'Compras está gestionando los faltantes', detail: `${procurementLines || shortageCount} línea(s) en seguimiento de abastecimiento.`, action: 'waiting' as const }
          : fullyDelivered
            ? { title: 'Materiales entregados a la OT', detail: `${issuedLines} línea(s) con entrega completa registrada.`, action: 'ready' as const }
            : { title: 'Revisar cobertura y entrega', detail: `${coveredLines} de ${rows.length} líneas tienen cobertura registrada; aún no consta entrega completa.`, action: 'review' as const };

  return (
    <Card className="shadow-none">
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle className="text-base">Materiales de la OT</CardTitle>
            <p className="mt-1 text-sm text-muted-foreground">Durante la transición de Bodega, esta gestión es opcional y no bloquea la ejecución ni el cierre de la OT.</p>
          </div>
          {rows.length > 0 ? <Badge variant={shortageCount > 0 ? 'destructive' : fullyDelivered ? 'secondary' : 'outline'}>{shortageCount > 0 ? `${shortageCount} línea(s) con faltante` : fullyDelivered ? 'Entregado' : 'Pendiente de verificar entrega'}</Badge> : <Badge variant="outline">Sin requerimiento</Badge>}
        </div>

        <div className="rounded-lg border bg-muted/20 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Estado y acciones opcionales</p>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><p className="font-medium">{primaryAction.title}</p><p className="mt-1 text-sm text-muted-foreground">{primaryAction.detail}</p></div>
            {primaryAction.action === 'issue' ? <Button size="sm" onClick={issueAvailable} disabled={issuing || sending || saving}><PackageCheck className="mr-2 h-4 w-4" />{issuing ? 'Entregando…' : 'Entregar reservas'}</Button> : null}
            {primaryAction.action === 'procure' ? <Button size="sm" onClick={sendShortagesToPurchasing} disabled={sending || issuing || saving || !status.supply_need_id}><ShoppingCart className="mr-2 h-4 w-4" />{sending ? 'Enviando…' : 'Enviar a Compras'}</Button> : null}
            {primaryAction.action === 'waiting' ? <Badge variant="secondary">En Compras</Badge> : null}
            {primaryAction.action === 'ready' ? <Badge variant="secondary"><CheckCircle2 className="mr-1 h-3.5 w-3.5" />Entregado</Badge> : null}
            {primaryAction.action === 'review' ? <Badge variant="outline">Revisar entrega</Badge> : null}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {actionError ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{actionError}</div> : null}
        {actionMessage ? <div className="rounded-lg border bg-muted/40 p-3 text-sm">{actionMessage}</div> : null}

        {rows.length > 0 ? <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {[['Líneas requeridas', rows.length], ['Con reserva', reservedLines], ['Con entrega', issuedLines], ['Con faltante', shortageCount], ['En Compras', procurementLines]].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-1 text-xl font-semibold tabular-nums">{value}</p></div>)}
        </div> : null}

        <div className="flex justify-end"><Button size="sm" variant="outline" onClick={() => setAdding((value) => !value)} disabled={saving || issuing || sending}>{adding ? <X className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}{adding ? 'Cerrar' : rows.length === 0 ? 'Registrar material (opcional)' : 'Agregar otro material'}</Button></div>

        {adding ? <div className="rounded-lg border bg-muted/20 p-4">
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_120px_auto] md:items-end">
            <div className="space-y-2"><p className="text-xs font-medium">Buscar producto canónico</p><Input value={query} onChange={(event) => { setQuery(event.target.value); setSelected(null); }} placeholder="Código o nombre, mínimo 2 caracteres" /></div>
            <div className="space-y-2"><p className="text-xs font-medium">Cantidad</p><Input type="number" min="0.01" step="0.01" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></div>
            <Button onClick={addMaterial} disabled={!selected || saving || Number(quantity) <= 0}>{saving ? 'Guardando…' : 'Agregar'}</Button>
          </div>
          {catalogData?.stockEvidenceAvailable === false ? (
            <p className="mt-3 text-xs text-amber-700 dark:text-amber-300">El corte Laudus no está disponible. Puedes registrar materiales requeridos, pero no confirmar disponibilidad.</p>
          ) : null}
          {selected ? <div className="mt-3 rounded-md border bg-card p-3 text-sm"><p className="font-medium">{selected.productCode || 'Sin código'} · {selected.productName}</p><p className="mt-1 text-xs text-muted-foreground">{laudusReferenceLabel(selected)} El saldo observado no autoriza reservar ni entregar materiales.</p></div> : null}
          {!selected && query.trim().length >= 2 ? <div className="mt-3 max-h-56 overflow-auto rounded-md border bg-card">
            {catalogLoading ? <p className="p-3 text-sm text-muted-foreground">Buscando…</p> : catalogError ? <p className="p-3 text-sm text-destructive">No se pudo buscar el catálogo. Vuelve a intentar.</p> : catalogRows.length === 0 ? <p className="p-3 text-sm text-muted-foreground">Sin productos coincidentes.</p> : catalogRows.map((item) => <button key={item.productId} type="button" onClick={() => setSelected(item)} className="block w-full border-b px-3 py-2 text-left last:border-b-0 hover:bg-muted/50"><p className="text-sm font-medium">{item.productCode || 'Sin código'} · {item.productName}</p><p className="mt-0.5 text-xs text-muted-foreground">{laudusReferenceLabel(item)}{item.family ? ` · ${item.family}` : ''}</p></button>)}
          </div> : null}
        </div> : null}

        {isLoading ? <div className="h-20 animate-pulse rounded-lg bg-muted" /> : null}
        {error ? <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">{error.message}</div> : null}
        {!isLoading && !error && rows.length === 0 ? <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground"><PackageSearch className="mx-auto mb-2 h-5 w-5" />Aún no se han definido materiales requeridos para esta orden.</div> : null}
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
