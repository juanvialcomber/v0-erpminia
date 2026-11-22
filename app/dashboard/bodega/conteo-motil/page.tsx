'use client';

import { useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, RefreshCw, Search } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type Product = {
  canonical_product_id: string;
  product_code: string;
  product_name: string;
  description: string | null;
  unit_of_measure: string;
};

type Count = {
  id: string;
  canonical_product_id: string;
  product_code: string;
  product_name: string;
  unit_of_measure: string;
  counted_quantity: number | string;
  counted_by: string;
  counted_at: string;
  note: string | null;
  evidence_reference: string | null;
  decision: 'approved_for_opening' | 'recount_required' | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  review_note: string | null;
};

type Payload = {
  warehouse: { id: string; name: string; code: string };
  products: Product[];
  productCount: number;
  page: number;
  counts: Count[];
  currentUserId: string;
  canCount: boolean;
  canReview: boolean;
  stockChanged: false;
  sourceSystem: 'MOTIL';
};

const fetcher = async (url: string): Promise<Payload> => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No fue posible cargar el conteo MOTIL.');
  return payload as Payload;
};

const formatDate = (value: string) => new Intl.DateTimeFormat('es-CL', {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: 'America/Santiago',
}).format(new Date(value));

const statusLabel = (decision: Count['decision']) => decision === 'approved_for_opening'
  ? 'Aprobado para apertura'
  : decision === 'recount_required' ? 'Requiere reconteo' : 'Pendiente de segunda revisión';

export default function ConteoMotilPage() {
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);
  const [activeProduct, setActiveProduct] = useState<string | null>(null);
  const [quantity, setQuantity] = useState('');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [reviewNotes, setReviewNotes] = useState<Record<string, string>>({});

  const key = '/api/bodega/motil-counts?search=' + encodeURIComponent(search) + '&page=' + page;
  const { data, error, isLoading, mutate } = useSWR(key, fetcher, { revalidateOnFocus: false });

  function openCount(product: Product) {
    setActiveProduct(product.canonical_product_id);
    setQuantity('');
    setNote('');
    setEvidence('');
    setConfirmed(false);
    setMessage('');
    setErrorMessage('');
  }

  async function submit(payload: Record<string, unknown>) {
    setSaving(true);
    setMessage('');
    setErrorMessage('');
    try {
      const response = await fetch('/api/bodega/motil-counts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No fue posible guardar el cambio.');
      setMessage('Registro guardado. No se modificó el stock disponible.');
      setActiveProduct(null);
      await mutate();
    } catch (err) {
      setErrorMessage(err instanceof Error ? err.message : 'No fue posible guardar el cambio.');
    } finally {
      setSaving(false);
    }
  }

  function recordCount(product: Product) {
    const normalized = quantity.trim().replace(',', '.');
    if (!/^(?:0|[1-9][0-9]{0,11})(?:\.[0-9]{1,6})?$/.test(normalized)) {
      setErrorMessage('Ingresa una cantidad válida, sin separadores de miles.');
      return;
    }
    if (!confirmed) {
      setErrorMessage('Confirma que observaste físicamente la cantidad.');
      return;
    }
    void submit({
      action: 'count',
      canonicalProductId: product.canonical_product_id,
      countedQuantity: normalized,
      note: note.trim(),
      evidenceReference: evidence.trim(),
      confirmPhysicalCount: true,
      requestId: crypto.randomUUID(),
    });
  }

  function reviewCount(count: Count, decision: 'approved_for_opening' | 'recount_required') {
    void submit({
      action: 'review',
      countId: count.id,
      decision,
      reviewNote: (reviewNotes[count.id] || '').trim(),
    });
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-16 md:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Bodega · {data?.warehouse.code || '002'}</p>
          <h1 className="text-2xl font-semibold">Conteo físico en MOTIL</h1>
        </div>
        <Button variant="outline" size="sm" onClick={() => void mutate()} disabled={isLoading || saving}>
          <RefreshCw className="mr-1 h-4 w-4" />Actualizar
        </Button>
      </div>

      <section className="space-y-2 rounded-lg border border-primary/30 bg-primary/5 p-4">
        <div className="flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-primary" /><h2 className="font-medium">MOTIL inicia el saldo operacional</h2></div>
        <p className="text-sm text-muted-foreground">
          Registra desde el catálogo validado de MOTIL, aunque Laudus no tenga saldo o su dato no sea confiable. Cada conteo queda como evidencia y exige revisión por una segunda persona asignada. Laudus no alimenta esta lista ni modifica el resultado.
        </p>
        <p className="text-sm font-medium">
          La aprobación deja el conteo listo para apertura. En esta etapa no cambia el stock disponible; el libro de movimientos actual todavía usa cantidades enteras y debe adaptarse antes de aplicar saldos.
        </p>
      </section>

      {message ? <div role="status" className="rounded-md border p-3 text-sm">{message}</div> : null}
      {errorMessage ? <div role="alert" className="flex items-start gap-2 rounded-md border p-3 text-sm text-destructive"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{errorMessage}</div> : null}
      {error ? <div role="alert" className="rounded-md border p-4 text-sm text-destructive">{error.message}</div> : null}

      {data && !data.canCount ? (
        <div className="rounded-md border p-3 text-sm text-muted-foreground">
          Puedes revisar la información, pero necesitas una asignación vigente de Bodega Central (002) para contar o aprobar.
        </div>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-semibold">Catálogo validado de MOTIL</h2>
            <p className="text-xs text-muted-foreground">{data ? data.productCount.toLocaleString('es-CL') + ' productos disponibles para conteo' : 'Cargando catálogo…'}</p>
          </div>
          <form className="flex w-full max-w-md gap-2" onSubmit={(event) => { event.preventDefault(); setSearch(searchInput.trim()); setPage(0); setActiveProduct(null); }}>
            <Input value={searchInput} onChange={(event) => setSearchInput(event.target.value)} placeholder="Código o nombre de producto" aria-label="Buscar producto MOTIL" />
            <Button type="submit" variant="secondary"><Search className="mr-1 h-4 w-4" />Buscar</Button>
          </form>
        </div>

        {isLoading ? <p className="rounded-md border p-4 text-sm text-muted-foreground">Cargando productos de MOTIL…</p> : null}
        {data?.products.map((product) => {
          const editing = activeProduct === product.canonical_product_id;
          return (
            <article key={product.canonical_product_id} className="space-y-3 rounded-lg border p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-medium">{product.product_name}</p>
                  <p className="text-xs text-muted-foreground">{product.product_code} · Unidad validada: {product.unit_of_measure}</p>
                  {product.description && product.description !== product.product_name ? <p className="mt-1 text-sm text-muted-foreground">{product.description}</p> : null}
                </div>
                {data.canCount && !editing ? <Button size="sm" variant="outline" onClick={() => openCount(product)}>Registrar cantidad física</Button> : null}
              </div>
              {editing ? (
                <div className="space-y-3 rounded-md border bg-muted/20 p-3">
                  <div className="grid gap-3 md:grid-cols-3">
                    <div className="space-y-1"><Label htmlFor="motil-count-quantity">Cantidad observada ({product.unit_of_measure})</Label><Input id="motil-count-quantity" inputMode="decimal" value={quantity} onChange={(event) => setQuantity(event.target.value)} placeholder="Ej.: 12 o 12,5" /></div>
                    <div className="space-y-1"><Label htmlFor="motil-count-evidence">Ubicación o evidencia (opcional)</Label><Input id="motil-count-evidence" value={evidence} onChange={(event) => setEvidence(event.target.value)} maxLength={500} placeholder="Pasillo, etiqueta, documento" /></div>
                    <div className="space-y-1"><Label htmlFor="motil-count-note">Observación (opcional)</Label><Input id="motil-count-note" value={note} onChange={(event) => setNote(event.target.value)} maxLength={1000} /></div>
                  </div>
                  <label className="flex cursor-pointer items-start gap-2 text-sm">
                    <input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} className="mt-1" />
                    <span>Confirmo que observé físicamente el producto, su unidad y la cantidad ingresada.</span>
                  </label>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={!confirmed || !quantity.trim() || saving} onClick={() => recordCount(product)}>{saving ? 'Guardando…' : 'Guardar conteo MOTIL'}</Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => setActiveProduct(null)}>Cancelar</Button>
                  </div>
                </div>
              ) : null}
            </article>
          );
        })}
        {data && data.products.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">No encontramos productos que coincidan con la búsqueda.</p> : null}
        {data && data.productCount > 50 ? (
          <div className="flex items-center justify-between">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => { setPage(Math.max(0, page - 1)); setActiveProduct(null); }}>Anterior</Button>
            <span className="text-xs text-muted-foreground">Página {page + 1} de {Math.ceil(data.productCount / 50)}</span>
            <Button variant="outline" size="sm" disabled={(page + 1) * 50 >= data.productCount} onClick={() => { setPage(page + 1); setActiveProduct(null); }}>Siguiente</Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3">
        <div>
          <h2 className="font-semibold">Conteos y revisiones</h2>
          <p className="text-xs text-muted-foreground">Historial de MOTIL · los conteos y las revisiones son inmutables.</p>
        </div>
        {(data?.counts || []).map((count) => (
          <article key={count.id} className="space-y-3 rounded-lg border p-4">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div>
                <p className="font-medium">{count.product_name}</p>
                <p className="text-xs text-muted-foreground">{count.product_code} · {count.unit_of_measure} · {formatDate(count.counted_at)}</p>
              </div>
              <Badge variant={count.decision === 'approved_for_opening' ? 'secondary' : 'outline'}>{statusLabel(count.decision)}</Badge>
            </div>
            <p className="text-lg font-semibold tabular-nums">{Number(count.counted_quantity).toLocaleString('es-CL', { maximumFractionDigits: 6 })} {count.unit_of_measure}</p>
            {count.note ? <p className="text-sm text-muted-foreground">Observación: {count.note}</p> : null}
            {count.evidence_reference ? <p className="text-xs text-muted-foreground">Evidencia/ubicación: {count.evidence_reference}</p> : null}
            {count.reviewed_at ? <p className="text-xs text-muted-foreground">Revisado el {formatDate(count.reviewed_at)}{count.review_note ? ' · ' + count.review_note : ''}</p> : null}
            {data?.canReview && !count.decision && count.counted_by !== data.currentUserId ? (
              <div className="space-y-2 rounded-md border bg-muted/20 p-3">
                <Label htmlFor={'review-note-' + count.id}>Nota de revisión {reviewNotes[count.id] ? '(opcional)' : ''}</Label>
                <Input id={'review-note-' + count.id} value={reviewNotes[count.id] || ''} onChange={(event) => setReviewNotes((prev) => ({ ...prev, [count.id]: event.target.value }))} maxLength={1000} placeholder="Explica el rechazo si solicitas reconteo" />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={saving || count.counted_by === data.currentUserId} onClick={() => reviewCount(count, 'approved_for_opening')}>Validar para apertura</Button>
                  <Button size="sm" variant="outline" disabled={saving || (reviewNotes[count.id] || '').trim().length < 8} onClick={() => reviewCount(count, 'recount_required')}>Solicitar reconteo</Button>
                </div>
                <p className="text-xs text-muted-foreground">La revisión debe hacerla otra persona asignada. Esta validación no agrega saldo disponible a MOTIL.</p>
              </div>
            ) : null}
          </article>
        ))}
        {data && data.counts.length === 0 ? <p className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">Aún no hay conteos guardados.</p> : null}
      </section>
    </div>
  );
}
