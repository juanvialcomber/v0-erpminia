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
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg"><ArchiveRestore className="h-4 w-4"/>Pautas históricas para validar <Badge variant="outline">{historyData?.summary?.reviewable || 0}</Badge></CardTitle>
        <CardDescription>Frecuencias recuperadas desde fuentes históricas. Revísalas antes de activarlas; MOTIL no modifica ninguna pauta sin confirmación humana.</CardDescription>
      </CardHeader>
      <CardContent className="p-0">
        {historyError ? <StatePanel tone="error" title="No fue posible cargar el archivo preventivo" description={historyError.message} className="min-h-0 border-0 bg-transparent" />
        : historyLoading ? <StatePanel tone="loading" title="Revisando archivo preventivo" className="min-h-32 border-0 bg-transparent" />
        : !historyData?.summary?.reviewable ? <StatePanel tone="neutral" title="No hay pautas históricas pendientes de validación" description="No existen candidatos restaurables con equipo canónico vigente." className="min-h-32 border-0 bg-transparent" />
        : <div className="divide-y">
            {(historyData?.candidates || []).filter((row:any) => row.assetExists && !row.alreadyActive).map((row:any) => (
              <div key={row.archiveId} className="grid gap-3 p-4 lg:grid-cols-[minmax(0,1fr)_180px_auto] lg:items-center">
                <div>
                  <div className="flex flex-wrap gap-2">
                    <Badge variant="outline">Pendiente de validación</Badge>
                    <Badge variant="outline">{row.frequencyHours ? `Cada ${number(row.frequencyHours)} h` : row.frequencyDays ? `Cada ${row.frequencyDays} días` : 'Frecuencia N/D'}</Badge>
                  </div>
                  <p className="mt-2 font-medium">{row.asset?.asset_code ? `${row.asset.asset_code} · ` : ''}{row.asset?.name || 'Equipo'}</p>
                  <p className="mt-1 text-sm">{row.taskName || 'Pauta sin nombre'}</p>
                  <p className="mt-1 text-xs text-muted-foreground">Fuente: {row.sourceReference || 'Archivo preventivo'}{row.lastExecutedMeter != null ? ` · última base histórica ${number(row.lastExecutedMeter)} ${row.meterUnit || 'h'}` : ''}</p>
                </div>
                <div className="text-xs text-muted-foreground">
                  <p>Registro histórico: {row.archivedAt ? new Date(row.archivedAt).toLocaleDateString('es-CL') : 'Sin fecha'}</p>
                  <p className="mt-1">La lectura vigente se toma desde MOTIL, no desde el archivo.</p>
                </div>
                <div>
                  {historyData?.canEdit ? <Button size="sm" onClick={() => void restoreHistoricalSchedule(row.archiveId)} disabled={restoringArchiveId===row.archiveId}>
                    <ArchiveRestore className="h-4 w-4"/>{restoringArchiveId===row.archiveId?'Activando…':'Validar y activar'}
                  </Button> : <span className="text-xs text-muted-foreground">Sólo planificación puede restaurar.</span>}
                </div>
              </div>
            ))}
          </div>}
      </CardContent>
    </Card>

    <Card className="shadow-none"><CardContent className="p-4 text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3.5 w-3.5"/>Crear la OT no mueve la pauta. El siguiente vencimiento sólo avanza cuando esa OT se cierra con una lectura real de horómetro.</CardContent></Card>
  </div>;
}
