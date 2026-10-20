'use client';
import { formatWorkOrderDate } from '@/lib/maintenance/work-order-calendar-date.mjs';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useRef, useState } from 'react';
import useSWR from 'swr';
import { CheckCircle2, History, MoreHorizontal, Pencil, PlayCircle, RotateCcw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { WorkOrderExecutionPanel } from '@/components/maintenance/work-order-execution-panel';
import { WorkOrderExecutionReadiness } from '@/components/maintenance/work-order-execution-readiness';
import { WorkOrderMaterialCoverage } from '@/components/maintenance/work-order-material-coverage';
import { WorkOrderPartsPanel } from '@/components/maintenance/work-order-parts-panel';
import { WorkOrderPurchasingFlow } from '@/components/maintenance/work-order-purchasing-flow';
import { WorkOrderStandardPlanPanel } from '@/components/maintenance/work-order-standard-plan-panel';
import { WorkOrderTimer } from '@/components/maintenance/work-order-timer';
import { MaintenanceOfflineDraft } from '@/components/maintenance/maintenance-offline-draft';
import { MaintenanceOfflinePhotos } from '@/components/maintenance/maintenance-offline-photos';
import { MaintenanceTerrainPrepare } from '@/components/maintenance/maintenance-terrain-prepare';
import { MobileWorkOrderFlow } from '@/components/maintenance/mobile-work-order-flow';
import { WorkOrderEvidenceAndApproval } from '@/components/maintenance/work-order-evidence-and-approval';
import { EntityTimeline } from '@/components/shared/entity-timeline';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { formatAssetIdentity, formatWorkOrderNumber } from '@/lib/maintenance/work-order-display';

type WorkOrderDetailT = Dictionary['app']['workOrderDetail'];

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload;
};

function durationLabel(value?: number | null) {
  if (value == null || !Number.isFinite(Number(value)) || Number(value) < 0) return 'Sin registrar';
  const minutes = Math.round(Number(value) * 60);
  const hours = Math.floor(minutes / 60);
  return hours ? hours + ' h ' + String(minutes % 60).padStart(2, '0') + ' min' : minutes + ' min';
}

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

function statusLabel(status: string | null | undefined, t: WorkOrderDetailT) {
  if (status === 'completed') return t.status.completed;
  if (status === 'in_progress') return t.status.inProgress;
  if (status === 'open') return t.status.open;
  if (status === 'planned') return t.status.planned;
  if (status === 'cancelled' || status === 'canceled') return 'Anulada';
  return status || t.status.none;
}

function priorityLabel(priority: string | null | undefined, t: WorkOrderDetailT) {
  const labels: Record<string, string> = { low: t.priority.low, medium: t.priority.medium, high: t.priority.high, critical: t.priority.critical };
  return labels[priority || ''] || priority || t.priority.none;
}

function typeLabel(type: string | null | undefined, t: WorkOrderDetailT) {
  const labels: Record<string, string> = {
    corrective: t.workType.corrective,
    correctivo: t.workType.corrective,
    preventive: t.workType.preventive,
    preventivo: t.workType.preventive,
    predictive: t.workType.predictive,
    predictivo: t.workType.predictive,
    inspection: t.workType.inspection,
    general: 'Trabajo general',
  };
  return labels[type || ''] || type || t.workType.none;
}

export function WorkOrderDetail({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.workOrderDetail;
  const dateLocale = locale === 'en' ? 'en-US' : 'es-CL';
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data, error, isLoading, mutate } = useSWR(id ? `/api/maintenance/work-orders/${id}` : null, fetcher);
  const { data: viewer, isLoading: viewerLoading } = useSWR('/api/maintenance/viewer-context', fetcher);
  const workOrder = data?.data;
  const [editOpen, setEditOpen] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveMessage, setSaveMessage] = useState('');
  const saveInFlight = useRef(false);
  const costCenters = data?.costCenters || [];
  const assignees = data?.assignees || [];
  const isHistorical = workOrder?.record_scope === 'historical' || data?.record_scope === 'historical';
  const canEdit = Boolean(data?.canEdit) && !isHistorical;
  const selectedCostCenter = costCenters.find((row: { id: string }) => row.id === workOrder?.cost_center_id);
  const isExecution = viewer?.mode === 'execution';

  const patchOrder = async (payload: Record<string, unknown>) => {
    if (isHistorical) throw new Error('historical work order is read-only');
    const response = await fetch(`/api/maintenance/work-orders/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => null);
    if (!response.ok) throw new Error(result?.error || 'request failed');
    await mutate();
  };

  const saveOrderEdits = async (payload: Record<string, unknown>) => {
    if (saveInFlight.current) return;
    saveInFlight.current = true;
    setSaveState('saving');
    setSaveMessage('');
    try {
      await patchOrder(payload);
      const response = await fetch('/api/maintenance/work-orders/' + id, {
        credentials: 'include',
        cache: 'no-store',
        headers: { 'Cache-Control': 'no-cache' },
      });
      const refreshed = await response.json().catch(() => null);
      if (!response.ok || !refreshed?.data) throw new Error(refreshed?.error || 'No fue posible comprobar el guardado.');
      const persisted = refreshed.data as Record<string, unknown>;
      const mismatch = Object.entries(payload).some(([key, value]) =>
        String(persisted[key] ?? '') !== String(value ?? '').trim()
      );
      await mutate(refreshed, false);
      if (mismatch) throw new Error('La OT respondió, pero los cambios todavía no aparecen guardados. Revisa antes de volver a intentar.');
      setSaveState('saved');
      setSaveMessage('Cambios guardados y verificados.');
    } catch (error) {
      setSaveState('error');
      setSaveMessage(error instanceof Error ? error.message : 'No se pudieron guardar los cambios.');
    } finally {
      saveInFlight.current = false;
    }
  };

  if (isLoading || viewerLoading) {
    return <div className="space-y-3">{Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-24 animate-pulse rounded-lg bg-muted" />)}</div>;
  }

  if (!workOrder) {
    return <Card className="shadow-none"><CardContent className="p-10 text-center"><p className="font-medium">{error ? t.loadFailed : t.notAvailable}</p><Button asChild variant="outline" className="mt-4"><Link href="/dashboard/mantenimiento/ordenes-trabajo">{t.backToOrders}</Link></Button></CardContent></Card>;
  }

  if ((workOrder.status === 'cancelled' || workOrder.status === 'canceled') && !isHistorical) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-4">
        <header className="border-b pb-5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{formatWorkOrderNumber(workOrder.work_order_number, locale)}</span>
            <Badge variant="outline">Anulada</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{workOrder.title || t.untitled}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatAssetIdentity(workOrder.asset_name, workOrder.asset_code) || (workOrder.work_type === 'general' ? 'Trabajo general del taller' : t.noAsset)}</p>
        </header>
        <p className="text-sm text-muted-foreground">Esta OT se conserva en el historial y ya no puede ejecutarse.</p>
        <details className="rounded-lg border bg-card">
          <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Historial de la OT</summary>
          <div className="border-t p-4"><EntityTimeline entity="work_order" id={id} limit={50} /></div>
        </details>
      </div>
    );
  }

  if (workOrder.status === 'completed' && !isHistorical) {
    return (
      <div className="mx-auto max-w-5xl space-y-5 py-4">
        <header className="flex flex-wrap items-start justify-between gap-5 border-b pb-5">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{formatWorkOrderNumber(workOrder.work_order_number, locale)}</span>
              <Badge variant="outline">Completada</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">{workOrder.title || t.untitled}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatAssetIdentity(workOrder.asset_name, workOrder.asset_code) || (workOrder.work_type === 'general' ? 'Trabajo general del taller' : t.noAsset)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {(workOrder.canonical_asset_id || workOrder.asset_id) ? <Button asChild variant="outline"><Link href={`/dashboard/mantenimiento/equipos/${workOrder.canonical_asset_id || workOrder.asset_id}`}>Ficha 360</Link></Button> : null}
          </div>
        </header>
        <WorkOrderExecutionPanel workOrderId={id} readOnly />
        <WorkOrderEvidenceAndApproval workOrderId={id} status={workOrder.status} />
      </div>
    );
  }

  if (isExecution) {
    return (
      <div className="space-y-4 py-2 sm:py-6">
        <MaintenanceTerrainPrepare workOrderId={id} />
        <details className="rounded-lg border p-4">
          <summary className="cursor-pointer text-sm">Registros locales de esta sesión</summary>
          {viewer?.offlineScope ? <MaintenanceOfflineDraft workOrderId={id} offlineScope={viewer.offlineScope} /> : null}
          {viewer?.offlineScope ? <MaintenanceOfflinePhotos workOrderId={id} offlineScope={viewer.offlineScope} /> : null}
        </details>
        <MobileWorkOrderFlow
          workOrderId={id}
          workOrderNumber={workOrder.work_order_number}
          title={workOrder.title}
          assetName={workOrder.asset_name || workOrder.asset_code}
          description={workOrder.description}
          status={workOrder.status}
          assignedPersonId={workOrder.assigned_person_id}
          canEdit={canEdit}
          onWorkOrderChange={mutate}
        />
        <div className="mx-auto w-full max-w-xl space-y-4">
          <WorkOrderEvidenceAndApproval workOrderId={id} status={workOrder.status} />
          {workOrder.status === 'completed' ? (
            <details className="rounded-lg border bg-card">
              <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium">Historial de la OT</summary>
              <div className="border-t p-4">
                <EntityTimeline entity="work_order" id={id} limit={50} />
              </div>
            </details>
          ) : null}
        </div>
      </div>
    );
  }

  if (viewer?.mode === 'planning' && !isHistorical) {
    const preparationReady = Boolean(workOrder.assigned_person_id && workOrder.cost_center_id);
    const isStarted = workOrder.status === 'in_progress' || workOrder.status === 'completed';
    const isCompleted = workOrder.status === 'completed';
    const nextAction = !workOrder.assigned_person_id
      ? t.assigneeCard.pending
      : !workOrder.cost_center_id
        ? t.financial.pending
        : !isStarted
          ? t.actions.startWork
          : !isCompleted
            ? t.actions.continueClose
            : t.status.completed;

    return <div className="mx-auto max-w-5xl space-y-5">
      <section className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-sm text-muted-foreground">{formatWorkOrderNumber(workOrder.work_order_number, locale)}</span>
            <Badge variant="outline">{statusLabel(workOrder.status, t)}</Badge>
          </div>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight">{workOrder.title || t.untitled}</h1>
          <p className="mt-1 text-sm text-muted-foreground">{formatAssetIdentity(workOrder.asset_name, workOrder.asset_code) || t.noAsset}</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          {canEdit && !isCompleted ? <Button type="button" variant="outline" onClick={() => {
            setEditOpen(true);
            requestAnimationFrame(() => document.getElementById('edit-work-order')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
          }}><Pencil className="mr-2 h-4 w-4" />Editar</Button> : null}
          {isCompleted ? (
            <div className="min-w-44 rounded-lg border px-5 py-3 text-right">
              <p className="text-xs text-muted-foreground">Tiempo ejecutado</p>
              <p className="text-3xl font-semibold tracking-tight tabular-nums">{durationLabel(workOrder.actual_duration_hours)}</p>
            </div>
          ) : null}
        {(workOrder.canonical_asset_id || workOrder.asset_id) ? <Button asChild variant="outline"><Link href={`/dashboard/mantenimiento/equipos/${workOrder.canonical_asset_id || workOrder.asset_id}`}>Ficha 360</Link></Button> : null}
        </div>
      </section>

      {!isCompleted ? (
      <Card className="shadow-none">
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Seguimiento simple</CardTitle>
          <p className="text-sm text-muted-foreground">Próximo paso: <span className="font-medium text-foreground">{nextAction}</span></p>
        </CardHeader>
        <CardContent>
          <div className="grid overflow-hidden rounded-lg border sm:grid-cols-3">
            <div className={`p-4 ${preparationReady ? 'bg-muted/30' : ''}`}>
              <p className="text-xs text-muted-foreground">01</p>
              <p className="mt-2 font-medium">Preparar</p>
              <p className="mt-1 text-xs text-muted-foreground">{preparationReady ? 'Responsable e imputación listos' : 'Asignar responsable e imputación'}</p>
            </div>
            <div className={`border-t p-4 sm:border-l sm:border-t-0 ${isStarted ? 'bg-muted/30' : ''}`}>
              <p className="text-xs text-muted-foreground">02</p>
              <p className="mt-2 font-medium">Ejecutar</p>
              <p className="mt-1 text-xs text-muted-foreground">{isStarted ? 'Trabajo iniciado' : 'Iniciar cuando esté preparado'}</p>
            </div>
            <div className={`border-t p-4 sm:border-l sm:border-t-0 ${isCompleted ? 'bg-muted/30' : ''}`}>
              <p className="text-xs text-muted-foreground">03</p>
              <p className="mt-2 font-medium">Cerrar</p>
              <p className="mt-1 text-xs text-muted-foreground">{isCompleted ? 'OT cerrada' : 'Validar evidencia y cerrar'}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      ) : null}
      {canEdit ? <details id="edit-work-order" open={editOpen} onToggle={(event) => setEditOpen(event.currentTarget.open)} className="scroll-mt-24 rounded-lg border bg-card">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Editar OT</summary>
        <form className="grid gap-4 border-t p-4" onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          void saveOrderEdits(workOrder.status === 'in_progress' ? {
            title: String(form.get('title') || ''),
            description: String(form.get('description') || ''),
          } : {
            title: String(form.get('title') || ''),
            description: String(form.get('description') || ''),
            work_type: String(form.get('work_type') || ''),
            priority: String(form.get('priority') || ''),
            scheduled_date: String(form.get('scheduled_date') || '') || null,
          });
        }}>
          {workOrder.status === 'in_progress' ? <p className="text-sm text-muted-foreground">La OT está en curso. Puedes corregir el nombre o la descripción sin alterar la planificación.</p> : null}
          <div className="space-y-2"><Label htmlFor="edit-title">Trabajo</Label><Input id="edit-title" name="title" defaultValue={workOrder.title || ''} required /></div>
          <div className="space-y-2"><Label htmlFor="edit-description">Descripción</Label><Textarea id="edit-description" name="description" defaultValue={workOrder.description || ''} rows={3} /></div>
          {workOrder.status !== 'in_progress' ? <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2"><Label htmlFor="edit-work-type">Tipo</Label><select id="edit-work-type" name="work_type" defaultValue={workOrder.work_type || 'corrective'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="corrective">Correctivo</option><option value="preventive">Preventivo</option><option value="inspection">Inspección</option>{workOrder.work_type === 'general' ? <option value="general">Trabajo general</option> : null}</select></div>
            <div className="space-y-2"><Label htmlFor="edit-priority">Prioridad</Label><select id="edit-priority" name="priority" defaultValue={workOrder.priority || 'medium'} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option><option value="critical">Crítica</option></select></div>
            <div className="space-y-2"><Label htmlFor="edit-date">Fecha</Label><Input id="edit-date" name="scheduled_date" type="date" defaultValue={workOrder.scheduled_date?.slice(0,10) || ''} /></div>
          </div> : null}
          <div className="flex flex-wrap items-center gap-3"><Button type="submit" disabled={saveState === 'saving'}>{saveState === 'saving' ? 'Guardando…' : 'Guardar cambios'}</Button>{saveMessage ? <p role="status" aria-live="polite" className={saveState === 'error' ? 'text-sm text-destructive' : 'text-sm text-muted-foreground'}>{saveMessage}</p> : null}</div>
        </form>
        <div className="border-t p-4">
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">Anular OT</summary>
            <div className="mt-3 flex items-center justify-between gap-4 rounded-md border p-3"><p className="text-sm text-muted-foreground">La OT quedará en el historial y no podrá ejecutarse.</p><Button type="button" variant="destructive" onClick={() => void patchOrder({ status: 'cancelled' })}>Confirmar anulación</Button></div>
          </details>
        </div>
      </details> : null}

      <Card className="shadow-none">
        <CardHeader className="pb-3"><CardTitle className="text-base">Preparación</CardTitle></CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="assignee">{t.assigneeCard.label}</Label>
            <select id="assignee" value={workOrder.assigned_person_id || ''} disabled={!canEdit || isCompleted} onChange={(event) => void patchOrder({ assigned_person_id: event.target.value || null })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">{t.assigneeCard.unassigned}</option>
              {assignees.map((row: { id: string; full_name: string; role_title?: string | null }) => <option key={row.id} value={row.id}>{row.full_name}{row.role_title ? ` · ${row.role_title}` : ''}</option>)}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cost-center">{t.financial.label}</Label>
            <select id="cost-center" value={workOrder.cost_center_id || ''} disabled={!canEdit || isCompleted} onChange={(event) => void patchOrder({ cost_center_id: event.target.value || null })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm">
              <option value="">{t.financial.none}</option>
              {costCenters.map((row: { id: string; code: string; name: string }) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}
            </select>
          </div>
          <div className="lg:col-span-2 flex flex-wrap gap-2">
            {!isStarted ? <Button onClick={() => void patchOrder({ status: 'in_progress' })} disabled={!canEdit || !preparationReady}><PlayCircle className="mr-2 h-4 w-4" />{t.actions.startWork}</Button> : null}
            {workOrder.status === 'in_progress' ? <Button asChild><Link href={`/dashboard/mantenimiento/ordenes-trabajo/cierre?workOrderId=${id}`}><CheckCircle2 className="mr-2 h-4 w-4" />{t.actions.continueClose}</Link></Button> : null}
          </div>
        </CardContent>
      </Card>

      <Card className="shadow-none">
        <CardHeader className="pb-3"><CardTitle className="text-base">Trabajo</CardTitle></CardHeader>
        <CardContent>
          <p className="text-sm leading-6">{workOrder.description || t.intervention.noDescription}</p>
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <div><p className="text-xs text-muted-foreground">{t.summary.type}</p><p className="mt-1 font-medium">{typeLabel(workOrder.work_type, t)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.summary.priority}</p><p className="mt-1 font-medium">{priorityLabel(workOrder.priority, t)}</p></div>
            <div><p className="text-xs text-muted-foreground">{t.summary.scheduled}</p><p className="mt-1 font-medium">{workOrder.scheduled_date ? formatWorkOrderDate(workOrder.scheduled_date, dateLocale) : t.summary.noDate}</p></div>
          </div>
        </CardContent>
      </Card>

      <WorkOrderEvidenceAndApproval workOrderId={id} status={workOrder.status} />

      <details className="group rounded-lg border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium">
          Ver detalle técnico y abastecimiento
          <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
        </summary>
        <div className="space-y-5 border-t p-5">
          <WorkOrderExecutionReadiness workOrderId={id} assignedToName={workOrder.assigned_to_name} status={workOrder.status} />
          <WorkOrderStandardPlanPanel workOrderId={id} />
          <WorkOrderMaterialCoverage workOrderId={id} />
          <WorkOrderPartsPanel workOrderId={id} />
          <WorkOrderPurchasingFlow workOrderId={id} />
          <WorkOrderExecutionPanel workOrderId={id} />
          <EntityTimeline entity="work_order" id={id} limit={50} />
        </div>
      </details>
    </div>;
  }

  if (viewer?.mode === 'leadership' && !isHistorical) {
    return (
      <div className="mx-auto max-w-5xl space-y-5">
        <section className="flex flex-col gap-4 border-b border-border/70 pb-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-sm text-muted-foreground">{formatWorkOrderNumber(workOrder.work_order_number, locale)}</span>
              <Badge variant="outline">{statusLabel(workOrder.status, t)}</Badge>
            </div>
            <h1 className="mt-2 text-2xl font-semibold tracking-tight">{workOrder.title || t.untitled}</h1>
            <p className="mt-1 text-sm text-muted-foreground">{formatAssetIdentity(workOrder.asset_name, workOrder.asset_code) || t.noAsset}</p>
          </div>
        </section>

        <WorkOrderEvidenceAndApproval workOrderId={id} status={workOrder.status} />

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium">
            Ver información de la OT
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="space-y-5 border-t p-5">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {workOrder.assigned_to_name ? <div><p className="text-xs text-muted-foreground">{t.summary.assignee}</p><p className="mt-1 font-medium">{workOrder.assigned_to_name}</p></div> : null}
              {workOrder.scheduled_date ? <div><p className="text-xs text-muted-foreground">{t.summary.scheduled}</p><p className="mt-1 font-medium">{formatWorkOrderDate(workOrder.scheduled_date, dateLocale)}</p></div> : null}
              {workOrder.priority ? <div><p className="text-xs text-muted-foreground">{t.summary.priority}</p><p className="mt-1 font-medium">{priorityLabel(workOrder.priority, t)}</p></div> : null}
              {workOrder.work_type ? <div><p className="text-xs text-muted-foreground">{t.summary.type}</p><p className="mt-1 font-medium">{typeLabel(workOrder.work_type, t)}</p></div> : null}
            </div>

            {workOrder.description ? <div><p className="text-xs text-muted-foreground">Trabajo solicitado</p><p className="mt-1 text-sm leading-6">{workOrder.description}</p></div> : null}

            {(workOrder.root_cause || workOrder.preventive_actions) ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {workOrder.root_cause ? <div><p className="text-xs text-muted-foreground">{t.intervention.rootCause}</p><p className="mt-1 text-sm font-medium">{workOrder.root_cause}</p></div> : null}
                {workOrder.preventive_actions ? <div><p className="text-xs text-muted-foreground">{t.intervention.preventiveAction}</p><p className="mt-1 text-sm font-medium">{workOrder.preventive_actions}</p></div> : null}
              </div>
            ) : null}
          </div>
        </details>

        <details className="group rounded-lg border bg-card">
          <summary className="flex cursor-pointer list-none items-center justify-between px-5 py-4 text-sm font-medium">
            Ver plan, materiales e historial
            <MoreHorizontal className="h-4 w-4 text-muted-foreground" />
          </summary>
          <div className="space-y-5 border-t p-5">
            <WorkOrderStandardPlanPanel workOrderId={id} />
            <WorkOrderMaterialCoverage workOrderId={id} />
            <WorkOrderPurchasingFlow workOrderId={id} />
            <EntityTimeline entity="work_order" id={id} limit={50} />
          </div>
        </details>
      </div>
    );
  }

  return <div className="space-y-6">
    <section className="flex flex-col gap-4 border-b border-border/70 pb-6 lg:flex-row lg:items-start lg:justify-between">
      <div><div className="flex flex-wrap items-center gap-2"><span className="font-mono text-sm text-muted-foreground">{formatWorkOrderNumber(workOrder.work_order_number, locale)}</span><Badge variant="outline">{statusLabel(workOrder.status, t)}</Badge>{isHistorical ? <Badge variant="secondary">{t.historicalBadge}</Badge> : <Badge variant="outline">{t.operationalBadge}</Badge>}</div><h1 className="mt-2 text-3xl font-semibold tracking-tight">{workOrder.title || t.untitled}</h1><p className="mt-2 text-sm text-muted-foreground">{formatAssetIdentity(workOrder.asset_name, workOrder.asset_code) || t.noAsset}</p></div>
      {!isHistorical ? <div className="flex gap-2">{workOrder.status !== 'in_progress' && workOrder.status !== 'completed' ? <Button onClick={() => void patchOrder({ status: 'in_progress' })} disabled={!canEdit || !workOrder.assigned_person_id}><PlayCircle className="mr-2 h-4 w-4" />{t.actions.startWork}</Button> : null}{workOrder.status === 'in_progress' ? <Button asChild><Link href={`/dashboard/mantenimiento/ordenes-trabajo/cierre?workOrderId=${id}`}><CheckCircle2 className="mr-2 h-4 w-4" />{t.actions.continueClose}</Link></Button> : null}<DropdownMenu><DropdownMenuTrigger asChild><Button variant="outline" size="icon" aria-label={t.actions.moreActions}><MoreHorizontal className="h-4 w-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem disabled={!canEdit} onClick={() => void patchOrder({ status: 'open' })}><RotateCcw className="mr-2 h-4 w-4" />{t.actions.reopen}</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div> : null}
    </section>

    {isHistorical ? <Card className="border-muted-foreground/20 bg-muted/20 shadow-none"><CardContent className="flex items-start gap-3 p-4"><History className="mt-0.5 h-5 w-5 text-muted-foreground" /><div><p className="font-medium">{t.historicalCard.title}</p><p className="mt-1 text-sm text-muted-foreground">{t.historicalCard.description}</p></div></CardContent></Card> : null}

    <details data-testid="ot-detail-more-summary" className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver más · Datos de la OT</summary>
      <div className="border-t p-3">
    <Card className="shadow-none"><CardHeader><CardTitle className="text-base">{t.summary.title} {isHistorical ? t.summary.historicalSuffix : t.summary.operationalSuffix}</CardTitle></CardHeader><CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-6"><div><p className="text-xs text-muted-foreground">{t.summary.status}</p><p className="mt-1 font-medium">{statusLabel(workOrder.status, t)}</p></div><div><p className="text-xs text-muted-foreground">{t.summary.priority}</p><p className="mt-1 font-medium">{priorityLabel(workOrder.priority, t)}</p></div><div><p className="text-xs text-muted-foreground">{t.summary.type}</p><p className="mt-1 font-medium">{typeLabel(workOrder.work_type, t)}</p></div><div><p className="text-xs text-muted-foreground">{t.summary.assignee}</p><p className="mt-1 font-medium">{workOrder.assigned_to_name || t.summary.unassigned}</p></div><div><p className="text-xs text-muted-foreground">{t.summary.scheduled}</p><p className="mt-1 font-medium">{workOrder.scheduled_date ? formatWorkOrderDate(workOrder.scheduled_date, dateLocale) : t.summary.noDate}</p></div><div><p className="text-xs text-muted-foreground">{t.summary.initialReading}</p><p className="mt-1 font-medium">{workOrder.meter_reading ? `${workOrder.meter_reading} ${workOrder.meter_unit || ''}` : t.summary.noReading}</p></div></CardContent></Card>
      </div>
    </details>

    {!isHistorical ? <WorkOrderExecutionReadiness workOrderId={id} assignedToName={workOrder.assigned_to_name} status={workOrder.status} /> : null}

    {!isHistorical ? <Card className="shadow-none"><CardHeader><CardTitle className="text-base">{t.assigneeCard.title}</CardTitle></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end"><div className="space-y-2"><Label htmlFor="assignee">{t.assigneeCard.label}</Label><select id="assignee" value={workOrder.assigned_person_id || ''} disabled={!canEdit || workOrder.status === 'completed'} onChange={(event) => void patchOrder({ assigned_person_id: event.target.value || null })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">{t.assigneeCard.unassigned}</option>{assignees.map((row: { id: string; full_name: string; role_title?: string | null }) => <option key={row.id} value={row.id}>{row.full_name}{row.role_title ? ` · ${row.role_title}` : ''}</option>)}</select></div><div className="pb-2 text-sm"><span className={workOrder.assigned_person_id ? 'text-foreground' : 'text-destructive'}>{workOrder.assigned_person_id ? t.assigneeCard.ready : t.assigneeCard.pending}</span></div></div></CardContent></Card> : null}

    {!isHistorical ? <Card className="shadow-none"><CardHeader><CardTitle className="text-base">{t.financial.title}</CardTitle></CardHeader><CardContent><div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end"><div className="space-y-2"><Label htmlFor="cost-center">{t.financial.label}</Label><select id="cost-center" value={workOrder.cost_center_id || ''} disabled={!canEdit} onChange={(event) => void patchOrder({ cost_center_id: event.target.value || null })} className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"><option value="">{t.financial.none}</option>{costCenters.map((row: { id: string; code: string; name: string }) => <option key={row.id} value={row.id}>{row.code} · {row.name}</option>)}</select></div><div className="pb-2 text-sm"><span className={workOrder.cost_center_id ? 'text-foreground' : 'text-destructive'}>{workOrder.cost_center_id ? fill(t.financial.readyTemplate, { code: selectedCostCenter?.code || t.financial.readyDefault }) : t.financial.pending}</span></div></div></CardContent></Card> : null}

    <Card className="shadow-none"><CardHeader><CardTitle className="text-base">{t.intervention.title}</CardTitle></CardHeader><CardContent className={isHistorical ? '' : 'grid gap-5 lg:grid-cols-[1fr_320px]'}><div><p className="text-sm leading-6">{workOrder.description || t.intervention.noDescription}</p><div className="mt-5 grid gap-4 sm:grid-cols-2"><div><p className="text-xs text-muted-foreground">{t.intervention.rootCause}</p><p className="mt-1 text-sm font-medium">{workOrder.root_cause || (isHistorical ? t.intervention.noEvidence : t.intervention.pendingClose)}</p></div><div><p className="text-xs text-muted-foreground">{t.intervention.preventiveAction}</p><p className="mt-1 text-sm font-medium">{workOrder.preventive_actions || (isHistorical ? t.intervention.noEvidence : t.intervention.pendingClose)}</p></div></div></div>{!isHistorical ? <WorkOrderTimer workOrderId={id} /> : null}</CardContent></Card>

    {!isHistorical ? <>
      <WorkOrderStandardPlanPanel workOrderId={id} />
      <WorkOrderMaterialCoverage workOrderId={id} />
      <WorkOrderPartsPanel workOrderId={id} />
      <WorkOrderPurchasingFlow workOrderId={id} />
      <WorkOrderExecutionPanel workOrderId={id} />
    </> : null}
    {!isHistorical ? <WorkOrderEvidenceAndApproval workOrderId={id} status={workOrder.status} /> : null}
    <details data-testid="ot-detail-history" className="rounded-lg border bg-card">
      <summary className="cursor-pointer px-4 py-3 text-sm font-medium">Ver más · Historial de la OT</summary>
      <div className="border-t p-4"><EntityTimeline entity="work_order" id={id} limit={50} /></div>
    </details>
  </div>;
}
