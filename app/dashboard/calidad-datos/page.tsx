'use client';

import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, CheckCircle2, ExternalLink, RefreshCw, Search, ShieldCheck } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { DataSourceStatusStrip } from '@/components/data/data-source-status-strip';
import { LaudusMasterReadinessCard } from '@/components/integrations/laudus-master-readiness-card';

type Review = { status: 'open' | 'accepted' | 'resolved' | 'ignored'; resolution_note: string | null; evidence_reference: string | null; reviewed_at: string | null } | null;
type Issue = { issue_key: string; entity_type: string; entity_id: string | null; issue_type: string; field_name: string | null; severity: 'observation' | 'warning' | 'critical'; label: string; detail: string; href: string; active: boolean; review: Review };
type Data = { counts: { total_records: number; active_issues: number; critical: number; duplicate_candidates: number; orphan_references: number; reviewed: number; by_entity: Record<string, number> }; issues: Issue[]; generatedAt: string };
const fetcher = async (url: string) => { const response = await fetch(url, { credentials: 'include' }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar'); return payload as Data; };
const entityLabels: Record<string, string> = { product: 'Producto', supplier: 'Proveedor', asset: 'Equipo', person: 'Persona', inventory: 'Inventario', work_order: 'Orden de trabajo', purchase_order: 'Orden de compra', invoice: 'Factura', cost_center: 'Centro de costo', warehouse: 'Bodega', external_source: 'Fuente externa' };
const issueLabels: Record<string, string> = { missing_field: 'Campo incompleto', missing_identity: 'Identidad incompleta', validation_status: 'Validación pendiente', duplicate_candidate: 'Duplicado candidato', orphan_reference: 'Referencia huérfana', negative_value: 'Valor negativo', inconsistent_quantity: 'Cantidad inconsistente' };

export default function CalidadDatosPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/data-quality/reconciliation', fetcher, { revalidateOnFocus: false });
  const [entity, setEntity] = useState('all');
  const [status, setStatus] = useState('open');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<Issue | null>(null);
  const [resolutionStatus, setResolutionStatus] = useState('resolved');
  const [note, setNote] = useState('');
  const [evidence, setEvidence] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const filtered = useMemo(() => (data?.issues || []).filter((row) => {
    if (entity !== 'all' && row.entity_type !== entity) return false;
    const reviewStatus = row.review?.status || 'open';
    if (status !== 'all' && reviewStatus !== status) return false;
    const needle = query.trim().toLowerCase();
    if (needle && !`${row.label} ${row.detail} ${entityLabels[row.entity_type] || row.entity_type}`.toLowerCase().includes(needle)) return false;
    return true;
  }), [data?.issues, entity, status, query]);

  async function saveReview(event: FormEvent) {
    event.preventDefault();
    if (!selected || (resolutionStatus !== 'open' && !note.trim())) return;
    setSaving(true);
    setMessage(null);
    const response = await fetch('/api/data-quality/reconciliation', {
      method: 'PATCH',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ issueKey: selected.issue_key, entityType: selected.entity_type, entityId: selected.entity_id, issueType: selected.issue_type, fieldName: selected.field_name, status: resolutionStatus, resolutionNote: note.trim(), evidenceReference: evidence.trim() || null }),
    });
    const payload = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) { setMessage(payload?.error || 'No se pudo guardar la revisión.'); return; }
    setSelected(null);
    setNote('');
    setEvidence('');
    setMessage('Revisión guardada. El dato fuente no fue modificado.');
    await mutate();
  }

  const counts = data?.counts;
  const sourceUnavailable = isLoading || Boolean(error) || !counts;
  const summary = [
    ['Pendientes', counts?.active_issues],
    ['Críticos', counts?.critical],
    ['Duplicados', counts?.duplicate_candidates],
    ['Referencias huérfanas', counts?.orphan_references],
  ] as const;

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-border/70 pb-6 md:flex-row md:items-end md:justify-between">
      <div><p className="text-sm font-medium text-muted-foreground">Datos · revisión transversal</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Revisiones</h1><p className="mt-2 max-w-3xl text-sm text-muted-foreground">Una sola bandeja para discrepancias de productos, proveedores, equipos, inventario, compras, finanzas y futuras fuentes externas. Revisar no modifica automáticamente la fuente.</p></div>
      <Button variant="outline" onClick={() => void mutate()}><RefreshCw className="mr-2 h-4 w-4" />Actualizar</Button>
    </section>

    <DataSourceStatusStrip
      reviewHref="/dashboard/calidad-datos/salud"
      sources={[
        { key: 'canonical', label: 'Datos canónicos', state: error ? 'review' : isLoading ? 'syncing' : 'updated', detail: 'Productos, proveedores, activos y relaciones validadas.' },
        { key: 'operations', label: 'Operación MOTIL', state: error ? 'review' : isLoading ? 'syncing' : 'updated', detail: 'Bodega, OT, compras y registros operacionales.' },
        { key: 'laudus', label: 'Laudus', state: 'pending', detail: 'Se incorporará a esta misma bandeja cuando la API quede habilitada.' },
        { key: 'evidence', label: 'Evidencia externa', state: 'updated', detail: 'Archivos, DTE y fuentes permanecen separadas hasta ser conciliadas.' },
      ]}
    />

    <LaudusMasterReadinessCard />

    {message && <Card className="shadow-none"><CardContent className="p-4 text-sm">{message}</CardContent></Card>}

    <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-2 xl:grid-cols-4">
      {summary.map(([label, value]) => <div key={label} className="bg-card p-4"><p className="text-2xl font-semibold">{sourceUnavailable || value == null ? '—' : value.toLocaleString('es-CL')}</p><p className="mt-1 text-xs text-muted-foreground">{label}</p></div>)}
    </div>

    <section className="grid gap-3 border-y py-4 md:grid-cols-[1fr_190px_190px]"><div className="relative"><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input className="pl-9" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar registro o condición" /></div><Select value={entity} onValueChange={setEntity}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Todas las entidades</SelectItem>{Object.entries(entityLabels).map(([value,label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select><Select value={status} onValueChange={setStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="open">Pendientes</SelectItem><SelectItem value="resolved">Resueltos</SelectItem><SelectItem value="accepted">Aceptados</SelectItem><SelectItem value="ignored">Descartados</SelectItem><SelectItem value="all">Todos</SelectItem></SelectContent></Select></section>

    <section className="overflow-hidden rounded-lg border"><div className="border-b px-4 py-3"><h2 className="text-base font-semibold">Cola de conciliación · {sourceUnavailable ? '—' : filtered.length.toLocaleString('es-CL')}</h2></div><div>{error ? <div className="p-6 text-sm text-muted-foreground">No se pudo evaluar la calidad de datos.</div> : isLoading ? <div className="p-6 text-sm text-muted-foreground">Evaluando fuentes canónicas…</div> : filtered.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground"><CheckCircle2 className="mx-auto mb-3 h-5 w-5"/>No hay incidencias para este filtro.</div> : <div className="divide-y border-t">{filtered.slice(0, 500).map((row) => <div key={row.issue_key} className="p-4"><div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between"><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant={row.severity === 'critical' ? 'destructive' : 'outline'}>{row.severity === 'critical' ? 'Crítico' : row.severity === 'warning' ? 'Revisar' : 'Observación'}</Badge><Badge variant="secondary">{entityLabels[row.entity_type] || row.entity_type}</Badge><Badge variant="outline">{issueLabels[row.issue_type] || row.issue_type}</Badge>{row.review && row.review.status !== 'open' && <Badge variant="secondary">{row.review.status === 'resolved' ? 'Resuelto' : row.review.status === 'accepted' ? 'Aceptado' : 'Descartado'}</Badge>}</div><p className="mt-3 font-medium">{row.label}</p><p className="mt-1 text-sm text-muted-foreground">{row.detail}</p>{row.review?.resolution_note && <p className="mt-2 text-sm">Decisión: {row.review.resolution_note}</p>}{!row.active && <p className="mt-2 text-xs text-muted-foreground">La condición ya no aparece en la fuente actual.</p>}</div><div className="flex shrink-0 gap-2"><Button size="sm" variant="outline" asChild><a href={row.href}><ExternalLink className="mr-2 h-4 w-4"/>Fuente</a></Button><Button size="sm" onClick={() => { setSelected(row); setResolutionStatus(row.review?.status || 'resolved'); setNote(row.review?.resolution_note || ''); setEvidence(row.review?.evidence_reference || ''); }}><ShieldCheck className="mr-2 h-4 w-4"/>Revisar</Button></div></div></div>)}</div>}</div></section>

    {selected && <Card className="border-primary/30 shadow-none"><CardHeader><CardTitle className="text-lg">Revisar incidencia</CardTitle></CardHeader><CardContent><form className="space-y-4" onSubmit={saveReview}><div className="rounded-lg bg-muted/40 p-4"><p className="font-medium">{selected.label}</p><p className="mt-1 text-sm text-muted-foreground">{selected.detail}</p></div><div className="space-y-2"><Label>Decisión</Label><Select value={resolutionStatus} onValueChange={setResolutionStatus}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="resolved">Corregido en la fuente</SelectItem><SelectItem value="accepted">Aceptar como válido</SelectItem><SelectItem value="ignored">Descartar incidencia</SelectItem><SelectItem value="open">Mantener pendiente</SelectItem></SelectContent></Select></div><div className="space-y-2"><Label>Fundamento de la decisión</Label><Textarea value={note} onChange={(event) => setNote(event.target.value)} rows={4} placeholder="Describe la verificación realizada. La conciliación no modifica el maestro automáticamente."/></div><div className="space-y-2"><Label>Evidencia o referencia</Label><Input value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="Folio, archivo, URL o referencia verificable"/></div><div className="flex gap-2"><Button disabled={saving || (resolutionStatus !== 'open' && !note.trim())}>Guardar revisión</Button><Button type="button" variant="ghost" onClick={() => setSelected(null)}>Cancelar</Button></div></form></CardContent></Card>}

    <p className="text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>Los indicadores se calculan desde productos, proveedores, equipos, personas, inventario y OT de la organización activa. Una revisión registra trazabilidad; no altera automáticamente el registro fuente.</p>
  </div>;
}
