'use client';

import { useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowLeft, ArrowRight, RefreshCw, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';

type VerificationState = 'pending' | 'matched' | 'difference' | 'source_changed';

type Row = {
  canonical_product_id: string;
  sku: string;
  description: string | null;
  unit_of_measure: string | null;
  source_quantity: number;
  source_synced_at: string | null;
  source_cutoff: string | null;
  source_identity_count: number;
  canonicalization_state: string;
  counted_quantity: number | null;
  verified_source_quantity: number | null;
  verified_at: string | null;
  verification_note: string | null;
  verification_state: VerificationState;
  difference_from_current_source: number | null;
};

type VerificationProgress = {
  warehouseName: string;
  sourceCutoff: string | null;
  sourceSyncedAt: string | null;
  scope: 'with-stock';
  readOnlyStock: true;
  counts: {
    total: number;
    pending: number;
    matched: number;
    difference: number;
    source_changed: number;
  };
};

type Payload = {
  warehouseName: string;
  responsibleName: string;
  temporarySupportName: string | null;
  temporarySupportUntil: string | null;
  canVerify: boolean;
  sourceCutoff: string | null;
  sourceSyncedAt: string | null;
  rows: Row[];
  count: number;
  offset: number;
  limit: number;
  readOnlyStock: boolean;
};

const labels: Record<VerificationState, string> = {
  pending: 'Pendiente de contar',
  matched: 'Conteo coincide',
  difference: 'Diferencia por revisar',
  source_changed: 'Laudus cambió desde el conteo',
};

const fetcher = async (url: string): Promise<Payload> => {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || 'No se pudo consultar el stock.');
  return payload as Payload;
};

const progressFetcher = async (url: string): Promise<VerificationProgress> => {
  const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await res.json().catch(() => null);
  if (!res.ok) throw new Error(payload?.error || 'No se pudo revisar el avance de conteos.');
  return payload as VerificationProgress;
};

const qty = (value: number | null | undefined) => value === null || value === undefined
  ? 'Sin conteo' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 6 }).format(value);
const date = (value: string | null | undefined) => value
  ? new Intl.DateTimeFormat('es-CL', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Santiago' }).format(new Date(value))
  : 'Sin corte';

function normalizeCount(value: string) {
  return value.trim().replace(',', '.');
}

export default function BodegaStockVerificationPage() {
  const [scope, setScope] = useState('with-stock');
  const [state, setState] = useState('pending');
  const [skuInput, setSkuInput] = useState('');
  const [sku, setSku] = useState('');
  const [offset, setOffset] = useState(0);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [countInput, setCountInput] = useState('');
  const [note, setNote] = useState('');
  const [evidenceReference, setEvidenceReference] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [requestId, setRequestId] = useState('');
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedAt, setSavedAt] = useState('');

  const url = '/api/bodega/stock-verification?scope=' + encodeURIComponent(scope)
    + '&state=' + encodeURIComponent(state) + '&sku=' + encodeURIComponent(sku)
    + '&offset=' + offset + '&limit=25';
  const { data, error, isLoading, mutate } = useSWR(url, fetcher, { revalidateOnFocus: false });
  const { data: progress, error: progressError, isLoading: progressLoading, mutate: refreshProgress } =
    useSWR('/api/bodega/stock-verification?summary=1', progressFetcher, { revalidateOnFocus: false });
  const verifiedNow = (progress?.counts.matched || 0) + (progress?.counts.difference || 0);
  const progressPercent = progress && progress.counts.total > 0
    ? Math.round((verifiedNow / progress.counts.total) * 100)
    : null;
  const rows = data?.rows || [];

  function startReview(row: Row) {
    setActiveId(row.canonical_product_id);
    setCountInput('');
    setNote('');
    setEvidenceReference('');
    setConfirmed(false);
    setRequestId(crypto.randomUUID());
    setSaveError('');
    setSavedAt('');
  }

  function changeFilter(nextState: string, nextScope = scope) {
    setState(nextState);
    setScope(nextScope);
    setOffset(0);
    setActiveId(null);
    setSavedAt('');
  }

  async function submitCount(row: Row) {
    if (!data?.canVerify || saving || !confirmed) return;
    const countedQuantity = normalizeCount(countInput);
    if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(countedQuantity)) {
      setSaveError('Ingresa una cantidad válida, sin separadores de miles.');
      return;
    }
    if (Number(countedQuantity) !== Number(row.source_quantity) && note.trim().length < 8) {
      setSaveError('Explica la diferencia encontrada (mínimo 8 caracteres).');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const res = await fetch('/api/bodega/stock-verification', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canonicalProductId: row.canonical_product_id,
          countedQuantity,
          expectedSourceQuantity: String(row.source_quantity),
          expectedSourceSyncedAt: row.source_synced_at || '',
          note: note.trim(),
          evidenceReference: evidenceReference.trim(),
          confirmPhysicalCount: true,
          requestId,
        }),
      });
      const result = await res.json().catch(() => null);
      if (!res.ok || result?.recorded !== true) throw new Error(result?.error || 'No fue posible guardar la revisión.');
      setSavedAt(result.verifiedAt || '');
      setActiveId(null);
      await Promise.all([mutate(), refreshProgress()]);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'No fue posible guardar el conteo.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-16 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <Button asChild variant="outline" size="sm"><Link href="/dashboard/bodega"><ArrowLeft className="mr-1 h-4 w-4" />Volver a Bodega</Link></Button>
        <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading || saving}><RefreshCw className="mr-1 h-4 w-4" />Actualizar</Button>
      </div>

      <header className="space-y-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bodega Central · 002</p>
        <h1 className="text-2xl font-semibold">Verificar stock real</h1>
        <p className="text-sm text-muted-foreground">Responsable principal: <strong>{data?.responsibleName || 'Jefe de Bodega'}</strong>. {data?.temporarySupportName ? <>Apoyo temporal: <strong>{data.temporarySupportName}</strong> hasta {date(data.temporarySupportUntil)}. </> : null}Confirma únicamente cantidades contadas físicamente. Registrar un conteo no cambia las existencias de MOTIL ni de Laudus.</p>
        <p className="text-xs text-muted-foreground">Último corte Laudus: {date(data?.sourceCutoff)} · Sincronizado: {date(data?.sourceSyncedAt)}</p>
      </header>

      <section aria-label="Avance de conteos físicos" className="space-y-3">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">Avance · productos con saldo en Central</h2>
          <p className="text-xs text-muted-foreground">
            {progressError ? 'No disponible' : progressLoading || !progress ? 'Cargando avance…'
              : verifiedNow.toLocaleString('es-CL') + ' de ' + progress.counts.total.toLocaleString('es-CL')
                + ' con conteo vigente' + (progressPercent === null ? '' : ' · ' + progressPercent + '%')}
          </p>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 lg:grid-cols-4">
          {([
            { key: 'pending', label: 'Por contar', value: progress?.counts.pending },
            { key: 'matched', label: 'Coinciden', value: progress?.counts.matched },
            { key: 'difference', label: 'Con diferencia', value: progress?.counts.difference },
            { key: 'source_changed', label: 'Revisar cambio Laudus', value: progress?.counts.source_changed },
          ] as const).map((item) => (
            <button
              key={item.key}
              type="button"
              aria-pressed={state === item.key && scope === 'with-stock'}
              className="bg-card p-4 text-left transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring aria-pressed:bg-muted/40"
              onClick={() => changeFilter(item.key, 'with-stock')}
            >
              <p className="text-xs text-muted-foreground">{item.label}</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {progressLoading || progressError || !progress ? '—' : (item.value ?? 0).toLocaleString('es-CL')}
              </p>
            </button>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">Esteban define qué productos críticos revisar primero; Ariel puede apoyarlo. Un conteo no actualiza el stock y un cambio posterior de Laudus exige reconfirmación.</p>
        {progressError ? <p role="status" className="text-xs text-destructive">No se pudo obtener el avance de Bodega. Puedes continuar registrando conteos.</p> : null}
      </section>

      {data && !data.canVerify ? (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          Puedes consultar las revisiones, pero solo el responsable de Bodega o su apoyo temporal vigente pueden confirmar conteos físicos.
        </div>
      ) : null}
      {savedAt ? <div className="flex items-center gap-2 rounded-md border p-3 text-sm"><CheckCircle2 className="h-4 w-4" />Conteo registrado el {date(savedAt)}. No se modificó el stock.</div> : null}

      <section className="flex flex-wrap items-end gap-3 rounded-lg border p-3">
        <div className="min-w-[140px] flex-1 space-y-1">
          <Label htmlFor="stock-verify-filter">Estado</Label>
          <select id="stock-verify-filter" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={state} onChange={(e) => changeFilter(e.target.value)}>
            <option value="all">Todos</option>
            <option value="pending">Pendientes</option>
            <option value="matched">Coinciden</option>
            <option value="difference">Diferencias</option>
            <option value="source_changed">Laudus cambió</option>
          </select>
        </div>
        <div className="min-w-[155px] flex-1 space-y-1">
          <Label htmlFor="stock-verify-scope">Productos</Label>
          <select id="stock-verify-scope" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={scope} onChange={(e) => changeFilter(state, e.target.value)}>
            <option value="with-stock">Con saldo Laudus</option>
            <option value="all">Todos los productos</option>
          </select>
        </div>
        <form className="flex min-w-[200px] flex-[2] gap-2" onSubmit={(event) => { event.preventDefault(); setSku(skuInput.trim()); setOffset(0); setActiveId(null); }}>
          <div className="min-w-0 flex-1 space-y-1"><Label htmlFor="stock-verify-sku">Código o producto</Label><Input id="stock-verify-sku" placeholder="Ej. ACERO001 o rodamiento" value={skuInput} onChange={(e) => setSkuInput(e.target.value)} /></div>
          <Button className="self-end" type="submit" variant="secondary">Buscar</Button>
        </form>
      </section>

      {error ? <div className="flex items-start gap-2 rounded-md border p-4 text-sm"><AlertTriangle className="h-4 w-4" /><p>{error.message}</p></div> : null}
      {isLoading ? <p className="p-5 text-sm text-muted-foreground">Consultando cantidades…</p> : null}
      {!isLoading && !error && rows.length === 0 ? <p className="rounded-md border border-dashed p-5 text-sm text-muted-foreground">No hay productos para este filtro.</p> : null}

      {!isLoading && !error && rows.length > 0 ? (
        <div className="space-y-3">
          {rows.map((row) => {
            const editing = activeId === row.canonical_product_id;
            const match = countInput && Number(normalizeCount(countInput)) === Number(row.source_quantity);
            const canSubmit = confirmed && countInput.trim() && (match || note.trim().length >= 8);
            return <article key={row.canonical_product_id} className="rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="break-words font-medium">{row.description || 'Producto sin descripción'}</p>
                  <p className="text-xs text-muted-foreground">SKU {row.sku} · {row.unit_of_measure || 'Unidad sin confirmar'}</p>
                </div>
                <Badge variant={row.verification_state === 'matched' ? 'secondary' : 'outline'}>{labels[row.verification_state] || 'Revisar'}</Badge>
              </div>
              <div className="mt-3 grid gap-3 text-sm sm:grid-cols-3">
                <div><p className="text-xs text-muted-foreground">Laudus · Central</p><p className="font-semibold tabular-nums">{qty(row.source_quantity)} {row.unit_of_measure || ''}</p></div>
                <div><p className="text-xs text-muted-foreground">Último conteo físico</p><p className="font-semibold tabular-nums">{qty(row.counted_quantity)} {row.unit_of_measure || ''}</p></div>
                <div><p className="text-xs text-muted-foreground">Verificado el</p><p className="font-medium">{date(row.verified_at)}</p></div>
              </div>
              {row.verification_note ? <p className="mt-2 text-xs text-muted-foreground">Observación: {row.verification_note}</p> : null}
              {data?.canVerify && !editing && row.source_identity_count === 1 ? <Button className="mt-3" size="sm" variant="outline" onClick={() => startReview(row)}>Registrar conteo físico</Button> : null}
              {data?.canVerify && row.source_identity_count !== 1 ? <p className="mt-3 text-xs text-muted-foreground">Primero se debe resolver la identificación del producto.</p> : null}

              {editing ? <div className="mt-4 space-y-3 rounded-md border bg-muted/20 p-3">
                <p className="text-sm font-medium">Conteo físico realizado en Bodega Central</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <div className="space-y-1"><Label htmlFor="physical-qty">Cantidad contada ({row.unit_of_measure || 'unidad'})</Label><Input id="physical-qty" type="text" inputMode="decimal" placeholder="Ej.: 12 o 12,5" autoComplete="off" value={countInput} onChange={(e) => setCountInput(e.target.value)} /></div>
                  <div className="space-y-1"><Label htmlFor="physical-reference">Referencia o ubicación (opcional)</Label><Input id="physical-reference" placeholder="Pasillo, conteo o documento" value={evidenceReference} onChange={(e) => setEvidenceReference(e.target.value)} maxLength={500} /></div>
                </div>
                <div className="space-y-1"><Label htmlFor="physical-note">Observación {match ? '(opcional)' : '(obligatoria cuando hay diferencia)'}</Label><Input id="physical-note" placeholder="Explica diferencia, faltantes o revisión" value={note} onChange={(e) => setNote(e.target.value)} maxLength={1000} /></div>
                <label className="flex cursor-pointer items-start gap-2 text-sm"><Checkbox checked={confirmed} onCheckedChange={(v) => setConfirmed(v === true)} /><span>Confirmo que revisé físicamente este producto y que la cantidad ingresada es la observada.</span></label>
                {saveError ? <p className="text-sm text-destructive">{saveError}</p> : null}
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={!canSubmit || saving} onClick={() => void submitCount(row)}>{saving ? 'Guardando…' : 'Confirmar conteo'}</Button>
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => setActiveId(null)}>Cancelar</Button>
                </div>
                <p className="text-xs text-muted-foreground">Se guardarán la cantidad, fecha, responsable y evidencia. Las diferencias requieren revisión; no se ajustan saldos automáticamente.</p>
              </div> : null}
            </article>;
          })}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-muted-foreground">{data ? String(data.count) + ' productos · ' + String(data.count ? offset + 1 : 0) + '–' + String(offset + rows.length) : ''}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => { setOffset(Math.max(0, offset - 25)); setActiveId(null); }}><ArrowLeft className="mr-1 h-4 w-4" />Anterior</Button>
              <Button size="sm" variant="outline" disabled={!data || offset + rows.length >= data.count} onClick={() => { setOffset(offset + 25); setActiveId(null); }}>Siguiente<ArrowRight className="ml-1 h-4 w-4" /></Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
