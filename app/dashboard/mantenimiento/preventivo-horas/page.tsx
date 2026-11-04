'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertTriangle, ArchiveRestore, CheckCircle2, ChevronDown, ChevronRight, ClipboardCheck, Gauge, MoreHorizontal, Pencil, RefreshCw, Search, Wrench, XCircle } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => { const response = await fetch(url, { credentials: 'include' }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar el preventivo por horas'); return payload; };
const number = (value: unknown) => new Intl.NumberFormat('es-CL', { maximumFractionDigits: 1 }).format(Number(value || 0));

export default function PreventiveHoursPage() {
  const searchParams = useSearchParams();
  const focusAssetId = searchParams.get('assetId');
  const focusDueMeter = searchParams.get('dueMeter');
  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/preventive-hours', fetcher, { revalidateOnFocus: false });
  const { data: historyData, error: historyError, isLoading: historyLoading, mutate: mutateHistory } = useSWR('/api/maintenance/preventive-history', fetcher, { revalidateOnFocus: false });
  const summary = data?.summary || {};
  const standardPlans = data?.standardPlans || { approved: 0, linkedSchedules: 0 };
  const tasks = Array.isArray(data?.tasks) ? data.tasks : [];
  const focusedTasks = focusAssetId ? tasks.filter((row:any) => String(row.canonical_asset_id || '') === focusAssetId && (focusDueMeter == null || Number(row.due_meter) === Number(focusDueMeter))) : [];
  const visibleTasks = focusAssetId ? focusedTasks : tasks;
  const focusRow = focusedTasks[0];
  const [planningId, setPlanningId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [historyActionId, setHistoryActionId] = useState<string | null>(null);
  const [historySearch, setHistorySearch] = useState('');
  const [historyStatus, setHistoryStatus] = useState<'pending' | 'validated' | 'dismissed' | 'all'>('pending');
  const [expandedAssets, setExpandedAssets] = useState<string[]>([]);
  const [selectedArchiveIds, setSelectedArchiveIds] = useState<string[]>([]);
  const [editingArchiveId, setEditingArchiveId] = useState<string | null>(null);
  const [editTaskName, setEditTaskName] = useState('');
  const [editFrequencyHours, setEditFrequencyHours] = useState('');
  const [editFrequencyDays, setEditFrequencyDays] = useState('');
  const [historyMessage, setHistoryMessage] = useState<string | null>(null);
  const [batchValidating, setBatchValidating] = useState(false);

  async function reviewHistoricalSchedule(row: any, action: 'validate' | 'dismiss', overrides?: { taskName?: string; frequencyHours?: number | null; frequencyDays?: number | null }) {
    setHistoryActionId(row.archiveId); setActionError(null); setHistoryMessage(null);
    try {
      const response = await fetch('/api/maintenance/preventive-history', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ archiveId: row.archiveId, action, ...overrides }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo guardar la decisión');
      setSelectedArchiveIds((current) => current.filter((id) => id !== row.archiveId));
      if (editingArchiveId === row.archiveId) setEditingArchiveId(null);
      setHistoryMessage(action === 'validate' ? 'Pauta validada y activada con trazabilidad.' : 'Pauta descartada de la cola; el archivo histórico se conserva.');
      await Promise.all([mutate(), mutateHistory()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar la decisión');
    } finally {
      setHistoryActionId(null);
    }
  }

  function startEditHistorical(row: any) {
    setEditingArchiveId(row.archiveId);
    setEditTaskName(row.taskName || '');
    setEditFrequencyHours(row.frequencyHours == null ? '' : String(row.frequencyHours));
    setEditFrequencyDays(row.frequencyDays == null ? '' : String(row.frequencyDays));
  }

  async function validateSelected() {
    const rows = (historyData?.candidates || []).filter((row:any) => selectedArchiveIds.includes(row.archiveId) && row.decision === 'pending' && row.assetExists && !row.alreadyActive);
    if (!rows.length) return;
    setBatchValidating(true); setActionError(null); setHistoryMessage(null);
    let ok = 0;
    const failures: string[] = [];
    for (const row of rows) {
      try {
        const response = await fetch('/api/maintenance/preventive-history', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ archiveId: row.archiveId, action: 'validate' }),
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.error || 'Error de validación');
        ok += 1;
      } catch (cause) {
        failures.push(cause instanceof Error ? cause.message : 'Error de validación');
      }
    }
    setSelectedArchiveIds([]);
    await Promise.all([mutate(), mutateHistory()]);
    setHistoryMessage(failures.length ? `${ok} pauta(s) validadas; ${failures.length} requieren revisión.` : `${ok} pauta(s) validadas y activadas.`);
    if (failures.length) setActionError(failures[0]);
    setBatchValidating(false);
  }

  async function planSchedule(scheduleId: string) {
    setPlanningId(scheduleId); setActionError(null);
    try {
      const response = await fetch('/api/maintenance/preventive-hours', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ scheduleId }) });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo generar la OT preventiva');
      await mutate();
      if (payload?.workOrderId) window.location.href = `/dashboard/mantenimiento/ordenes-trabajo/${payload.workOrderId}`;
    } catch (cause) { setActionError(cause instanceof Error ? cause.message : 'No se pudo generar la OT preventiva'); }
    finally { setPlanningId(null); }
  }

  const historyCandidates = Array.isArray(historyData?.candidates) ? historyData.candidates : [];
  const normalizedHistorySearch = historySearch.trim().toLowerCase();
  const filteredHistory = historyCandidates.filter((row:any) => {
    if (!row.assetExists) return false;
    if (historyStatus !== 'all' && row.decision !== historyStatus) return false;
    if (!normalizedHistorySearch) return true;
    const haystack = [row.asset?.asset_code, row.asset?.name, row.taskName, row.sourceReference].filter(Boolean).join(' ').toLowerCase();
    return haystack.includes(normalizedHistorySearch);
  });
  const historyGroups = Array.from(filteredHistory.reduce((map: Map<string, any>, row:any) => {
    const key = row.assetId || 'unknown';
    const current = map.get(key) || { assetId: key, asset: row.asset, rows: [], pending: 0, currentMeter: row.currentMeter, currentMeterAt: row.currentMeterAt };
    current.rows.push(row);
    if (row.decision === 'pending') current.pending += 1;
    if (current.currentMeter == null && row.currentMeter != null) {
      current.currentMeter = row.currentMeter;
      current.currentMeterAt = row.currentMeterAt;
    }
    map.set(key, current);
    return map;
  }, new Map<string, any>()).values());

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>Mantenimiento · Planificación por uso</PageHeaderEyebrow>
        <PageHeaderTitle>Preventivo por horómetro</PageHeaderTitle>
        <PageHeaderDescription>Controla vencimientos por horómetro usando sólo pautas validadas y lecturas reales. No existen umbrales genéricos: las frecuencias históricas quedan separadas hasta que planificación las confirme.</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions>
        <Button asChild variant="outline"><Link href="/dashboard/mantenimiento/horometros"><Gauge className="h-4 w-4"/>Horómetros</Link></Button>
        <Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4"/>Actualizar</Button>
      </PageHeaderActions>
    </PageHeader>

    {error ? <StatePanel tone="error" title="No fue posible cargar el preventivo por horas" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5" /> : null}
    {actionError ? <StatePanel tone="error" title="No fue posible planificar la intervención" description={actionError} className="min-h-0 py-5" /> : null}

    {focusAssetId && !isLoading && !error ? <Card className="shadow-none"><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">Intervención coordinada{focusRow ? ` · ${focusRow.asset_code || focusRow.asset_name || 'Activo'}` : ''}</CardTitle><CardDescription>{focusedTasks.length > 0 ? `${focusedTasks.length} pauta(s) comparten activo y ventana de vencimiento. Se muestran juntas para coordinar terreno.` : 'La ventana seleccionada ya no contiene pautas visibles.'}</CardDescription></div><Button asChild size="sm" variant="outline"><Link href="/dashboard/mantenimiento/preventivo-horas">Ver todas</Link></Button></CardHeader>{focusedTasks.length > 1 ? <CardContent><p className="text-sm text-muted-foreground">Agrupación operacional solamente: cada pauta conserva su identidad, evidencia, procedimiento y OT independiente. MOTIL no las fusiona automáticamente.</p></CardContent> : null}</Card> : null}

    <section aria-label="Estado preventivo" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {[
        ['Pautas configuradas', summary.configured_tasks || 0],
        ['Activos configurados', summary.configured_assets || 0],
        ['Vencidas', summary.overdue_tasks || 0],
        ['Pendientes', summary.pending_tasks || 0],
      ].map(([label,value]) => <Card key={String(label)} className="shadow-none"><CardContent className="p-4"><p className="text-xs text-muted-foreground">{label}</p><p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p></CardContent></Card>)}
    </section>

    <Card className="shadow-none"><CardHeader className="flex flex-row items-start justify-between gap-4"><div><CardTitle className="text-lg">{standardPlans.approved>0?'Procedimientos estándar disponibles':'Procedimiento estándar'}</CardTitle><CardDescription>{standardPlans.approved>0?`${number(standardPlans.approved)} plan(es) aprobado(s) · ${number(standardPlans.linkedSchedules)} pauta(s) vinculada(s) · ${number(summary.tasks_using_runtime_reading || 0)} pauta(s) usando lectura Motil.`:'Aún no existen planes estándar aprobados para esta organización.'}</CardDescription></div><Button asChild size="sm" variant="outline"><Link href="/dashboard/mantenimiento/planes-estandar"><ClipboardCheck className="h-4 w-4"/>Planes estándar</Link></Button></CardHeader>{standardPlans.approved>0?<CardContent><p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle2 className="h-4 w-4"/>Al generar una OT vinculada, MOTIL aplica el procedimiento aprobado y sus requerimientos configurados.</p></CardContent>:null}</Card>

    <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">{focusAssetId ? 'Pautas de esta intervención' : 'Pautas horarias'}</CardTitle><CardDescription>{focusAssetId ? 'La coordinación visual no altera el ciclo ni el estado de ninguna pauta.' : 'Cada pauta conserva su vencimiento, evidencia de horómetro y trazabilidad individual.'}</CardDescription></CardHeader><CardContent className="p-0">{isLoading ? <StatePanel tone="loading" title="Cargando pauta real" className="min-h-48 border-0 bg-transparent" /> : visibleTasks.length===0 ? <StatePanel tone="neutral" title={focusAssetId?'No hay pautas en esta ventana':'No hay pautas horarias configuradas'} description={focusAssetId?'La pauta pudo haber sido planificada o el vínculo de la intervención cambió.':'MOTIL no crea frecuencias por defecto. La planificación aparecerá cuando exista una pauta fuente.'} className="min-h-48 border-0 bg-transparent" /> : <div className="divide-y">{visibleTasks.map((row:any) => { const overdue=row.hour_status==='overdue'; const review=row.hour_status==='needs_review'; const missing=row.hour_status==='missing_meter'||row.hour_status==='missing_due_meter'; const planned=Boolean(row.generated_work_order_id); return <div key={row.schedule_id} className="p-4"><div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between"><div className="min-w-0"><div className="flex flex-wrap items-center gap-2">{planned ? <Badge>OT generada</Badge> : overdue ? <Badge variant="destructive">Vencida</Badge> : review ? <Badge variant="secondary">Revisar horómetro</Badge> : missing ? <Badge variant="outline">Sin base suficiente</Badge> : <Badge variant="outline">Pendiente</Badge>}<Badge variant="outline">Cada {number(row.frequency_hours)} h</Badge><span className="text-xs text-muted-foreground">{row.meter_evidence_source==='runtime_reading'?'Lectura Motil':'Snapshot fuente'}</span></div><p className="mt-2 font-medium">{row.asset_code?`${row.asset_code} · `:''}{row.asset_name||'Activo sin nombre'}</p><p className="mt-1 text-sm">{row.task_name}</p><div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground"><span>Actual: {row.effective_current_meter==null?'Sin lectura':`${number(row.effective_current_meter)} h`}</span><span>Vence: {row.due_meter==null?'Sin pauta':`${number(row.due_meter)} h`}</span><span>{row.remaining_hours==null?'Sin diferencia calculable':row.remaining_hours<0?`${number(Math.abs(Number(row.remaining_hours)))} h vencidas`:`${number(row.remaining_hours)} h restantes`}</span><span>Fuente: {row.source_reference||'Sin referencia'}</span></div></div><div className="flex flex-wrap gap-2"><Button asChild size="sm" variant="outline"><Link href={`/dashboard/mantenimiento/planes-estandar/progresivo?scheduleId=${encodeURIComponent(row.schedule_id)}`}><ClipboardCheck className="h-4 w-4"/>Definir plan</Link></Button>{planned ? <Button asChild size="sm"><Link href={`/dashboard/mantenimiento/ordenes-trabajo/${row.generated_work_order_id}`}>Abrir OT</Link></Button> : overdue && data?.canEdit ? <Button size="sm" onClick={() => void planSchedule(row.schedule_id)} disabled={planningId===row.schedule_id}><Wrench className="h-4 w-4"/>{planningId===row.schedule_id?'Generando…':'Planificar intervención'}</Button> : null}{(review||missing)?<Button asChild size="sm" variant="outline"><Link href="/dashboard/mantenimiento/horometros">Resolver horómetro</Link></Button>:null}</div></div></div>; })}</div>}</CardContent></Card>

    <Card className="shadow-none">
      <CardHeader className="gap-4">
        <div>
          <CardTitle className="flex flex-wrap items-center gap-2 text-lg"><ArchiveRestore className="h-4 w-4"/>Pautas históricas para validar</CardTitle>
          <CardDescription className="mt-1">Bandeja de decisión para planificación. El archivo histórico permanece intacto y el horómetro vigente siempre se obtiene desde MOTIL.</CardDescription>
        </div>
        <div className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
          <div className="bg-card p-3"><p className="text-xs text-muted-foreground">Por revisar</p><p className="mt-1 text-2xl font-semibold tabular-nums">{historyData?.summary?.pending || 0}</p></div>
          <div className="bg-card p-3"><p className="text-xs text-muted-foreground">Validadas</p><p className="mt-1 text-2xl font-semibold tabular-nums">{historyData?.summary?.validated || 0}</p></div>
          <div className="bg-card p-3"><p className="text-xs text-muted-foreground">Descartadas</p><p className="mt-1 text-2xl font-semibold tabular-nums">{historyData?.summary?.dismissed || 0}</p></div>
        </div>
        <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex flex-1 flex-col gap-2 sm:flex-row">
            <label className="relative flex-1">
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-muted-foreground"/>
              <input value={historySearch} onChange={(event) => setHistorySearch(event.target.value)} placeholder="Buscar equipo o tarea" className="h-9 w-full rounded-md border bg-background pl-9 pr-3 text-sm outline-none ring-offset-background focus-visible:ring-2 focus-visible:ring-ring"/>
            </label>
            <select value={historyStatus} onChange={(event) => setHistoryStatus(event.target.value as typeof historyStatus)} className="h-9 rounded-md border bg-background px-3 text-sm">
              <option value="pending">Por revisar</option>
              <option value="validated">Validadas</option>
              <option value="dismissed">Descartadas</option>
              <option value="all">Todas</option>
            </select>
          </div>
          {historyData?.canEdit && selectedArchiveIds.length > 0 ? <Button size="sm" onClick={() => void validateSelected()} disabled={batchValidating}>
            <CheckCircle2 className="h-4 w-4"/>{batchValidating ? 'Validando…' : `Validar seleccionadas (${selectedArchiveIds.length})`}
          </Button> : null}
        </div>
        {historyMessage ? <p className="text-sm text-muted-foreground" role="status">{historyMessage}</p> : null}
      </CardHeader>
      <CardContent className="p-0">
        {historyError ? <StatePanel tone="error" title="No fue posible cargar el archivo preventivo" description={historyError.message} className="min-h-0 border-0 bg-transparent" />
        : historyLoading ? <StatePanel tone="loading" title="Revisando archivo preventivo" className="min-h-32 border-0 bg-transparent" />
        : filteredHistory.length === 0 ? <StatePanel tone="neutral" title="No hay pautas para este filtro" description="Cambia la búsqueda o el estado para revisar otras decisiones históricas." className="min-h-32 border-0 bg-transparent" />
        : <div className="divide-y">
            {historyGroups.map((group:any) => {
              const expanded = expandedAssets.includes(group.assetId);
              return <div key={group.assetId}>
                <button type="button" onClick={() => setExpandedAssets((current) => current.includes(group.assetId) ? current.filter((id) => id !== group.assetId) : [...current, group.assetId])} className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left hover:bg-muted/40">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-medium">{group.asset?.asset_code ? `${group.asset.asset_code} · ` : ''}{group.asset?.name || 'Equipo'}</span>
                      {group.pending > 0 ? <Badge variant="outline">{group.pending} pendiente{group.pending===1?'':'s'}</Badge> : null}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground">{group.currentMeter == null ? 'Horómetro vigente: N/D' : `Horómetro vigente: ${number(group.currentMeter)} h`}{group.currentMeterAt ? ` · ${new Date(group.currentMeterAt).toLocaleDateString('es-CL')}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-muted-foreground">
                    <span>{group.rows.length} pauta{group.rows.length===1?'':'s'}</span>
                    {expanded ? <ChevronDown className="h-4 w-4"/> : <ChevronRight className="h-4 w-4"/>}
                  </div>
                </button>

                {expanded ? <div className="border-t bg-muted/10">
                  {group.rows.map((row:any) => {
                    const pending = row.decision === 'pending';
                    const editing = editingArchiveId === row.archiveId;
                    const selected = selectedArchiveIds.includes(row.archiveId);
                    return <div key={row.archiveId} className="border-b px-4 py-3 last:border-b-0">
                      <div className="grid gap-3 lg:grid-cols-[32px_minmax(0,1fr)_150px_170px_auto] lg:items-center">
                        <div>
                          {pending && historyData?.canEdit ? <input type="checkbox" checked={selected} aria-label={`Seleccionar ${row.taskName || 'pauta'}`} onChange={(event) => setSelectedArchiveIds((current) => event.target.checked ? [...current, row.archiveId] : current.filter((id) => id !== row.archiveId))} className="h-4 w-4 rounded border"/> : null}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="font-medium">{row.taskName || 'Pauta sin nombre'}</p>
                            {row.decision === 'validated' ? <Badge>Validada</Badge> : row.decision === 'dismissed' ? <Badge variant="secondary">Descartada</Badge> : <Badge variant="outline">Pendiente</Badge>}
                          </div>
                          <p className="mt-1 text-xs text-muted-foreground">Histórico: {row.lastExecutedMeter == null ? 'base N/D' : `${number(row.lastExecutedMeter)} ${row.meterUnit || 'h'}`} · Fuente: {row.sourceReference || 'Archivo preventivo'}</p>
                        </div>
                        <div><p className="text-xs text-muted-foreground">Frecuencia</p><p className="text-sm">{row.frequencyHours ? `Cada ${number(row.frequencyHours)} h` : row.frequencyDays ? `Cada ${row.frequencyDays} días` : 'N/D'}</p></div>
                        <div><p className="text-xs text-muted-foreground">Vigencia</p><p className="text-sm">{row.currentMeter == null ? 'Sin lectura actual' : `${number(row.currentMeter)} h actuales`}</p></div>
                        <div className="flex justify-end gap-2">
                          {pending && historyData?.canEdit ? <>
                            <Button size="sm" onClick={() => void reviewHistoricalSchedule(row,'validate')} disabled={historyActionId===row.archiveId}>
                              <CheckCircle2 className="h-4 w-4"/>{historyActionId===row.archiveId?'Guardando…':'Validar'}
                            </Button>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label="Más acciones"><MoreHorizontal className="h-4 w-4"/></Button></DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onSelect={() => startEditHistorical(row)}><Pencil className="h-4 w-4"/>Editar antes de validar</DropdownMenuItem>
                                <DropdownMenuItem variant="destructive" onSelect={() => void reviewHistoricalSchedule(row,'dismiss')}><XCircle className="h-4 w-4"/>Descartar</DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </> : <span className="text-xs text-muted-foreground">{row.review?.reviewed_at ? new Date(row.review.reviewed_at).toLocaleDateString('es-CL') : ''}</span>}
                        </div>
                      </div>

                      {editing ? <div className="mt-3 rounded-lg border bg-background p-3">
                        <p className="text-sm font-medium">Editar antes de validar</p>
                        <p className="mt-1 text-xs text-muted-foreground">El ajuste quedará registrado en la decisión de planificación; la fuente histórica original no cambia.</p>
                        <div className="mt-3 grid gap-3 md:grid-cols-[minmax(0,1fr)_160px_160px_auto] md:items-end">
                          <label className="text-xs text-muted-foreground">Tarea<input value={editTaskName} onChange={(event) => setEditTaskName(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"/></label>
                          <label className="text-xs text-muted-foreground">Frecuencia horas<input type="number" min="0" step="0.1" value={editFrequencyHours} onChange={(event) => setEditFrequencyHours(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"/></label>
                          <label className="text-xs text-muted-foreground">Frecuencia días<input type="number" min="0" step="1" value={editFrequencyDays} onChange={(event) => setEditFrequencyDays(event.target.value)} className="mt-1 h-9 w-full rounded-md border bg-background px-3 text-sm text-foreground"/></label>
                          <div className="flex gap-2">
                            <Button size="sm" variant="outline" onClick={() => setEditingArchiveId(null)}>Cancelar</Button>
                            <Button size="sm" onClick={() => void reviewHistoricalSchedule(row,'validate',{
                              taskName: editTaskName,
                              frequencyHours: editFrequencyHours === '' ? null : Number(editFrequencyHours),
                              frequencyDays: editFrequencyDays === '' ? null : Number(editFrequencyDays),
                            })}>Guardar y validar</Button>
                          </div>
                        </div>
                      </div> : null}
                    </div>;
                  })}
                </div> : null}
              </div>;
            })}
          </div>}
      </CardContent>
    </Card>

    <Card className="shadow-none"><CardContent className="p-4 text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>Crear la OT no mueve la pauta. El siguiente vencimiento sólo avanza cuando esa OT se cierra con una lectura real de horómetro.</CardContent></Card>
  </div>;
}
