'use client';

import { ReactNode, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import { ArrowRight, Plus, Save, Trash2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { Textarea } from '@/components/ui/textarea';
import { useModuleAccess } from '@/hooks/use-module-access';

type ActionKey = 'reports' | 'information_flow' | 'worker_tasks' | 'critical_stock' | 'central_stock';
type ActionStatus = 'pending' | 'in_progress' | 'ready_for_validation' | 'completed' | 'blocked';
type ActionRecord = { action_key: ActionKey; title: string; owner: string; status: ActionStatus; payload: Record<string, any>; evidence_reference: string | null; updated_at: string };
type ReportsDraft = { reports: Array<{ name: string; content: string; frequency: string; recipients: string }> };
type FlowDraft = { source: string; receiver: string; recorded_by: string; output: string; exceptions: string };
type TasksDraft = { tasks: Array<{ person: string; task: string; frequency: string }> };
type StockDraft = { items: Array<{ product_code: string; product_name: string; unit: string; proposed_minimum: string; current_location?: string; confirmed_by_esteban: boolean; confirmed_by_ariel: boolean }> };
type CentralDraft = { cutoff_date: string; snapshot_rows: string; source_reference: string; reconciliation_reference: string; delivery_reference: string };

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include', cache: 'no-store' });
  const body = await response.json().catch(() => null);
  if (!response.ok) throw new Error(body?.error || 'No se pudieron cargar las acciones.');
  return body as { actions: ActionRecord[] };
};
const labels: Record<ActionStatus, string> = { pending: 'Pendiente', in_progress: 'En curso', ready_for_validation: 'Para validar', completed: 'Cerrada', blocked: 'Bloqueada' };
const variants: Record<ActionStatus, 'outline' | 'secondary' | 'default' | 'destructive'> = { pending: 'outline', in_progress: 'secondary', ready_for_validation: 'default', completed: 'default', blocked: 'destructive' };
const statusOptions: ActionStatus[] = ['pending', 'in_progress', 'ready_for_validation', 'completed', 'blocked'];
const blankReport = () => ({ name: '', content: '', frequency: '', recipients: '' });
const blankTask = () => ({ person: '', task: '', frequency: '' });
const blankStockItem = () => ({ product_code: '', product_name: '', unit: '', proposed_minimum: '', current_location: '', confirmed_by_esteban: false, confirmed_by_ariel: false });

function ActionCard({ record, status, evidenceValue, onEvidenceChange, onStatusChange, onSave, saving, canEdit, canComplete, children }: {
  record: ActionRecord; status: ActionStatus; evidenceValue: string; onEvidenceChange: (value: string) => void; onStatusChange: (value: ActionStatus) => void; onSave: () => void; saving: boolean; canEdit: boolean; canComplete: boolean; children: ReactNode;
}) {
  return (
    <section id={record.action_key} className="scroll-mt-24 rounded-lg border bg-card" aria-labelledby={record.action_key + '-title'}>
      <div className="flex flex-col gap-3 border-b px-4 py-4 sm:flex-row sm:items-start sm:justify-between">
        <div><div className="flex flex-wrap items-center gap-2"><h2 id={record.action_key + '-title'} className="font-semibold">{record.title}</h2><Badge variant={variants[status]}>{labels[status]}</Badge></div><p className="mt-1 text-xs text-muted-foreground">Responsable: {record.owner}</p></div>
        <label className="flex items-center gap-2 text-xs text-muted-foreground">Estado
          <select value={status} disabled={!canEdit || saving} onChange={(event) => onStatusChange(event.target.value as ActionStatus)} className="h-9 rounded-md border bg-background px-2 text-foreground">
            {statusOptions.map((option) => <option key={option} value={option} disabled={option === 'completed' && !canComplete}>{labels[option]}</option>)}
          </select>
        </label>
      </div>
      <div className="space-y-4 p-4">{children}
        <div className="grid gap-3 border-t pt-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <div className="space-y-2"><Label htmlFor={record.action_key + '-evidence'}>Evidencia / referencia</Label><Input id={record.action_key + '-evidence'} value={evidenceValue} onChange={(event) => onEvidenceChange(event.target.value)} placeholder="Folio, archivo, acta o enlace interno" disabled={!canEdit || saving} /></div>
          <Button type="button" disabled={!canEdit || saving} onClick={onSave}><Save className="mr-2 h-4 w-4" />{saving ? 'Guardando…' : 'Guardar acción'}</Button>
        </div>
      </div>
    </section>
  );
}

export default function BodegaAcuerdosPage() {
  const { canEdit, canView, ready } = useModuleAccess();
  const editable = ready && canView('bodega_inventario');
  const canClose = ready && canEdit('bodega_inventario');
  const { data, error, isLoading, mutate } = useSWR('/api/bodega/meeting-actions', fetcher, { revalidateOnFocus: false });
  const [drafts, setDrafts] = useState<Record<string, any>>({});
  const [statuses, setStatuses] = useState<Record<string, ActionStatus>>({});
  const [evidence, setEvidence] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState<ActionKey | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!data?.actions) return;
    setDrafts(Object.fromEntries(data.actions.map((record) => [record.action_key, record.payload || {}])));
    setStatuses(Object.fromEntries(data.actions.map((record) => [record.action_key, record.status])));
    setEvidence(Object.fromEntries(data.actions.map((record) => [record.action_key, record.evidence_reference || ''])));
  }, [data?.actions]);

  const records = useMemo(() => new Map((data?.actions || []).map((item) => [item.action_key, item])), [data?.actions]);
  const completed = (data?.actions || []).filter((item) => item.status === 'completed').length;
  const pending = (data?.actions || []).filter((item) => item.status !== 'completed').length;

  function patchDraft<T extends Record<string, any>>(key: ActionKey, update: Partial<T>) {
    setDrafts((current) => ({ ...current, [key]: { ...(current[key] || {}), ...update } }));
  }
  function patchArray(key: ActionKey, arrayName: string, index: number, field: string, value: unknown) {
    const rows = [...(drafts[key]?.[arrayName] || [])];
    rows[index] = { ...rows[index], [field]: value };
    patchDraft(key, { [arrayName]: rows });
  }
  function addRow(key: ActionKey, arrayName: string, row: Record<string, unknown>) {
    patchDraft(key, { [arrayName]: [...(drafts[key]?.[arrayName] || []), row] });
  }
  function removeRow(key: ActionKey, arrayName: string, index: number) {
    patchDraft(key, { [arrayName]: (drafts[key]?.[arrayName] || []).filter((_: unknown, rowIndex: number) => rowIndex !== index) });
  }
  function setStatus(key: ActionKey, value: ActionStatus) { setStatuses((current) => ({ ...current, [key]: value })); }

  async function saveAction(key: ActionKey) {
    const evidenceReference = evidence[key] || '';
    setSaving(key); setMessage(null);
    try {
      const response = await fetch('/api/bodega/meeting-actions', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ actionKey: key, status: statuses[key] || 'pending', payload: drafts[key] || {}, evidenceReference }),
      });
      const body = await response.json().catch(() => null);
      if (!response.ok) throw new Error(body?.error || 'No se pudo guardar la acción.');
      setMessage('Acción guardada: ' + (records.get(key)?.title || key) + '.');
      await mutate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'No se pudo guardar la acción.');
    } finally { setSaving(null); }
  }

  const reportDraft: ReportsDraft = drafts.reports || { reports: [] };
  const flowDraft: FlowDraft = drafts.information_flow || { source: '', receiver: '', recorded_by: '', output: '', exceptions: '' };
  const taskDraft: TasksDraft = drafts.worker_tasks || { tasks: [] };
  const stockDraft: StockDraft = drafts.critical_stock || { items: [] };
  const centralDraft: CentralDraft = drafts.central_stock || { cutoff_date: '', snapshot_rows: '', source_reference: '', reconciliation_reference: '', delivery_reference: '' };

  const cards = [
    { key: 'reports', title: 'Definir reportes de Bodega' },
    { key: 'information_flow', title: 'Levantar flujo de información' },
    { key: 'worker_tasks', title: 'Describir tareas por bodeguero' },
    { key: 'critical_stock', title: 'Definir mínimos por producto' },
    { key: 'central_stock', title: 'Conciliar y compartir stock central' },
  ] as const;

  if (error) return <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-4 text-sm text-destructive">{error.message}</div>;

  return (
    <div className="space-y-6">
      <PageHeader>
        <PageHeaderContent>
          <PageHeaderEyebrow>Bodega · Reunión 16 de noviembre</PageHeaderEyebrow>
          <PageHeaderTitle>Definiciones de Bodega</PageHeaderTitle>
          <PageHeaderDescription>Registra reportes, responsables, mínimos propuestos y flujos acordados con Esteban y Ariel. Las tareas individuales se gestionan en Mi trabajo; estas definiciones no modifican stock.</PageHeaderDescription>
        </PageHeaderContent>
        <PageHeaderActions><Button asChild variant="outline"><Link href="/dashboard/acciones">Mi trabajo <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></PageHeaderActions>
      </PageHeader>

      <section className="flex flex-col gap-3 rounded-lg border bg-card p-4 sm:flex-row sm:items-center sm:justify-between" aria-label="Avance de acciones">
        <div><p className="text-sm font-medium">{isLoading ? 'Cargando acciones…' : completed + ' de ' + (data?.actions.length || 5) + ' acciones cerradas'}</p><p className="mt-1 text-xs text-muted-foreground">{pending} abiertas · el estado y los datos quedan compartidos con el equipo.</p></div>
        <nav className="flex flex-wrap gap-2" aria-label="Ir a una acción">
          {cards.map((card, index) => <a key={card.key} href={'#' + card.key} className="rounded-md border px-2.5 py-1.5 text-xs text-muted-foreground hover:text-foreground">A{index + 1}</a>)}
        </nav>
      </section>

      {message ? <p role="status" className="rounded-md border bg-muted/20 px-3 py-2 text-sm">{message}</p> : null}

      {isLoading ? <div className="h-48 animate-pulse rounded-lg bg-muted" /> : null}

      {records.get('reports') ? <ActionCard record={records.get('reports')!} status={statuses.reports || 'pending'} evidenceValue={evidence.reports || ''} onEvidenceChange={(value) => setEvidence((current) => ({ ...current, reports: value }))} onStatusChange={(value) => setStatus('reports', value)} onSave={() => void saveAction('reports')} saving={saving === 'reports'} canEdit={editable} canComplete={canClose}>
        <div className="space-y-3">
          <p className="text-sm font-medium">¿Qué reporte necesita Bodega? Agrega uno por fila.</p>
          {(reportDraft.reports || []).map((row, index) => <div key={index} className="grid gap-3 rounded-md border p-3 md:grid-cols-4">
            <div className="space-y-1"><Label>Nombre</Label><Input value={row.name} disabled={!editable} onChange={(e) => patchArray('reports','reports',index,'name',e.target.value)} placeholder="Ej.: faltantes de la semana" /></div>
            <div className="space-y-1"><Label>Contenido</Label><Input value={row.content} disabled={!editable} onChange={(e) => patchArray('reports','reports',index,'content',e.target.value)} placeholder="Campos o cifras requeridas" /></div>
            <div className="space-y-1"><Label>Frecuencia</Label><Input value={row.frequency} disabled={!editable} onChange={(e) => patchArray('reports','reports',index,'frequency',e.target.value)} placeholder="Diario, semanal…" /></div>
            <div className="space-y-1"><Label>Destinatarios</Label><div className="flex gap-2"><Input value={row.recipients} disabled={!editable} onChange={(e) => patchArray('reports','reports',index,'recipients',e.target.value)} placeholder="Personas o cargos" /><Button type="button" variant="ghost" size="icon" aria-label="Eliminar reporte" disabled={!editable} onClick={() => removeRow('reports','reports',index)}><Trash2 className="h-4 w-4" /></Button></div></div>
          </div>)}
          <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => addRow('reports','reports',blankReport())}><Plus className="mr-2 h-4 w-4" />Agregar reporte</Button>
        </div>
      </ActionCard> : null}

      {records.get('information_flow') ? <ActionCard record={records.get('information_flow')!} status={statuses.information_flow || 'pending'} evidenceValue={evidence.information_flow || ''} onEvidenceChange={(value) => setEvidence((current) => ({ ...current, information_flow: value }))} onStatusChange={(value) => setStatus('information_flow', value)} onSave={() => void saveAction('information_flow')} saving={saving === 'information_flow'} canEdit={editable} canComplete={canClose}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1"><Label>Origen de la información</Label><Input value={flowDraft.source || ''} disabled={!editable} onChange={(e) => patchDraft('information_flow',{source:e.target.value})} placeholder="Correo, Laudus, vale, WhatsApp…" /></div>
          <div className="space-y-1"><Label>Quién la recibe</Label><Input value={flowDraft.receiver || ''} disabled={!editable} onChange={(e) => patchDraft('information_flow',{receiver:e.target.value})} placeholder="Persona o área" /></div>
          <div className="space-y-1"><Label>Quién la registra y dónde</Label><Input value={flowDraft.recorded_by || ''} disabled={!editable} onChange={(e) => patchDraft('information_flow',{recorded_by:e.target.value})} placeholder="Responsable y módulo" /></div>
          <div className="space-y-1"><Label>Resultado que debe quedar</Label><Input value={flowDraft.output || ''} disabled={!editable} onChange={(e) => patchDraft('information_flow',{output:e.target.value})} placeholder="Stock, solicitud, reporte…" /></div>
          <div className="space-y-1 md:col-span-2"><Label>Excepciones y pasos manuales</Label><Textarea rows={3} value={flowDraft.exceptions || ''} disabled={!editable} onChange={(e) => patchDraft('information_flow',{exceptions:e.target.value})} placeholder="Desfase de fin de semana, vale pendiente, nota de crédito…" /></div>
        </div>
      </ActionCard> : null}

      {records.get('worker_tasks') ? <ActionCard record={records.get('worker_tasks')!} status={statuses.worker_tasks || 'pending'} evidenceValue={evidence.worker_tasks || ''} onEvidenceChange={(value) => setEvidence((current) => ({ ...current, worker_tasks: value }))} onStatusChange={(value) => setStatus('worker_tasks', value)} onSave={() => void saveAction('worker_tasks')} saving={saving === 'worker_tasks'} canEdit={editable} canComplete={canClose}>
        <div className="space-y-3">
          <p className="text-sm font-medium">Una fila por persona y tarea habitual.</p>
          {(taskDraft.tasks || []).map((row,index) => <div key={index} className="grid gap-3 rounded-md border p-3 md:grid-cols-[1fr_2fr_1fr_auto]">
            <div className="space-y-1"><Label>Persona</Label><Input value={row.person} disabled={!editable} onChange={(e) => patchArray('worker_tasks','tasks',index,'person',e.target.value)} placeholder="Nombre" /></div>
            <div className="space-y-1"><Label>Tarea</Label><Input value={row.task} disabled={!editable} onChange={(e) => patchArray('worker_tasks','tasks',index,'task',e.target.value)} placeholder="Qué hace y para qué" /></div>
            <div className="space-y-1"><Label>Frecuencia / disparador</Label><Input value={row.frequency} disabled={!editable} onChange={(e) => patchArray('worker_tasks','tasks',index,'frequency',e.target.value)} placeholder="Diaria, al recibir…" /></div>
            <Button type="button" variant="ghost" size="icon" aria-label="Eliminar tarea" disabled={!editable} onClick={() => removeRow('worker_tasks','tasks',index)}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
          <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => addRow('worker_tasks','tasks',blankTask())}><Plus className="mr-2 h-4 w-4" />Agregar tarea</Button>
        </div>
      </ActionCard> : null}

      {records.get('critical_stock') ? <ActionCard record={records.get('critical_stock')!} status={statuses.critical_stock || 'pending'} evidenceValue={evidence.critical_stock || ''} onEvidenceChange={(value) => setEvidence((current) => ({ ...current, critical_stock: value }))} onStatusChange={(value) => setStatus('critical_stock', value)} onSave={() => void saveAction('critical_stock')} saving={saving === 'critical_stock'} canEdit={editable} canComplete={canClose}>
        <div className="space-y-3">
          <div><p className="text-sm font-medium">Registra el mínimo acordado para cada código y unidad.</p><p className="mt-1 text-xs text-muted-foreground">Ubicación actual (pasillo, rack o nivel): opcional y temporal hasta el cambio de bodega. Los mínimos quedan como propuesta; no alimentan alertas ni órdenes todavía.</p></div>
          {(stockDraft.items || []).map((row,index) => <div key={index} className="grid gap-3 rounded-md border p-3 lg:grid-cols-[1fr_2fr_100px_130px_2fr_150px_150px_auto]">
            <div className="space-y-1"><Label>Código</Label><Input value={row.product_code} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'product_code',e.target.value)} placeholder="SKU" /></div>
            <div className="space-y-1"><Label>Producto</Label><Input value={row.product_name} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'product_name',e.target.value)} placeholder="Descripción" /></div>
            <div className="space-y-1"><Label>Unidad</Label><Input value={row.unit} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'unit',e.target.value)} placeholder="un, kg…" /></div>
            <div className="space-y-1"><Label>Mínimo propuesto</Label><Input type="number" min="0" step="any" value={row.proposed_minimum} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'proposed_minimum',e.target.value)} placeholder="Sin definir" /></div>
            <div className="space-y-1"><Label>Ubicación actual (opcional)</Label><Input value={row.current_location || ''} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'current_location',e.target.value)} placeholder="Pasillo, rack, nivel" /></div>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.confirmed_by_esteban} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'confirmed_by_esteban',e.target.checked)} />Esteban confirmó</label>
            <label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={row.confirmed_by_ariel} disabled={!editable} onChange={(e) => patchArray('critical_stock','items',index,'confirmed_by_ariel',e.target.checked)} />Ariel confirmó</label>
            <Button type="button" variant="ghost" size="icon" aria-label="Eliminar mínimo" disabled={!editable} onClick={() => removeRow('critical_stock','items',index)}><Trash2 className="h-4 w-4" /></Button>
          </div>)}
          <Button type="button" variant="outline" size="sm" disabled={!editable} onClick={() => addRow('critical_stock','items',blankStockItem())}><Plus className="mr-2 h-4 w-4" />Agregar producto crítico</Button>
        </div>
      </ActionCard> : null}

      {records.get('central_stock') ? <ActionCard record={records.get('central_stock')!} status={statuses.central_stock || 'pending'} evidenceValue={evidence.central_stock || ''} onEvidenceChange={(value) => setEvidence((current) => ({ ...current, central_stock: value }))} onStatusChange={(value) => setStatus('central_stock', value)} onSave={() => void saveAction('central_stock')} saving={saving === 'central_stock'} canEdit={editable} canComplete={canClose}>
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-md border bg-muted/20 p-3 sm:flex-row sm:items-center sm:justify-between"><div><p className="text-sm font-medium">Primero concilia el corte central completo</p><p className="mt-1 text-xs text-muted-foreground">La cola Laudus muestra cobertura, diferencias y casos que necesitan decisión de jefatura.</p></div><Button asChild variant="outline" size="sm"><Link href="/dashboard/bodega">Abrir conciliación <ArrowRight className="ml-2 h-4 w-4" /></Link></Button></div>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            <div className="space-y-1"><Label>Fecha de corte</Label><Input type="date" value={centralDraft.cutoff_date || ''} disabled={!editable} onChange={(e) => patchDraft('central_stock',{cutoff_date:e.target.value})} /></div>
            <div className="space-y-1"><Label>Posiciones del archivo</Label><Input type="number" min="1" step="1" value={centralDraft.snapshot_rows || ''} disabled={!editable} onChange={(e) => patchDraft('central_stock',{snapshot_rows:e.target.value})} placeholder="Total de filas válidas" /></div>
            <div className="space-y-1"><Label>Archivo / fuente</Label><Input value={centralDraft.source_reference || ''} disabled={!editable} onChange={(e) => patchDraft('central_stock',{source_reference:e.target.value})} placeholder="Nombre, folio o sincronización Laudus" /></div>
            <div className="space-y-1"><Label>Resultado de conciliación</Label><Input value={centralDraft.reconciliation_reference || ''} disabled={!editable} onChange={(e) => patchDraft('central_stock',{reconciliation_reference:e.target.value})} placeholder="Informe, revisión o folio" /></div>
            <div className="space-y-1 lg:col-span-2"><Label>Envío del stock completo</Label><Input value={centralDraft.delivery_reference || ''} disabled={!editable} onChange={(e) => patchDraft('central_stock',{delivery_reference:e.target.value})} placeholder="Destinatario + fecha + referencia del envío" /></div>
          </div>
        </div>
      </ActionCard> : null}

      {!isLoading && !data?.actions?.length ? <div className="rounded-lg border p-6 text-sm text-muted-foreground">No se cargaron acciones de Bodega.</div> : null}
      {!editable ? <p className="text-xs text-muted-foreground">Tu perfil puede consultar estas acciones; para guardar avances se requiere acceso de lectura a Bodega.</p> : null}
      {editable && !canClose ? <p className="text-xs text-muted-foreground">Puedes registrar avances y enviarlos a validación. El cierre final requiere permiso de edición de Bodega.</p> : null}
    </div>
  );
}
