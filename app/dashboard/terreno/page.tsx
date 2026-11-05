'use client';

import { FormEvent, useMemo, useState } from 'react';
import useSWR from 'swr';
import { Clock3, FileText, Package, Play, RefreshCw, UserRound, Wrench } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

type WorkOrder = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  priority: string | null;
  scheduled_date: string | null;
  start_date: string | null;
  planned_duration_hours: number | null;
  actual_duration_hours: number | null;
  canonical_asset_id: string | null;
};
type FieldData = {
  person: { id: string; full_name: string | null; role_title: string | null } | null;
  message?: string;
  workOrders: WorkOrder[];
  assets: Array<{ id: string; asset_code: string | null; asset_name: string | null; location: string | null; criticality: string | null }>;
  events: Array<{ id: number; work_order_id: string; event_type: string; event_at: string; summary: string | null; actor_name: string | null }>;
  labor: Array<{ id: string; work_order_id: string; started_at: string; ended_at: string | null; hours: number | null; notes: string | null }>;
  parts: Array<{ id: string; work_order_id: string; quantity_requested: number | null; quantity_issued: number | null; quantity_installed: number | null; quantity_returned: number | null; status: string | null }>;
};

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo cargar');
  return payload as FieldData;
};

function statusLabel(status: string | null) {
  const value = String(status || '').toLowerCase();
  if (value === 'in_progress') return 'En progreso';
  if (value === 'open') return 'Abierta';
  if (value === 'pending') return 'Pendiente';
  if (value === 'assigned') return 'Asignada';
  return status || 'Sin estado';
}

export default function TerrenoPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/field/work-orders', fetcher, { revalidateOnFocus: false });
  const [selectedId, setSelectedId] = useState('');
  const [note, setNote] = useState('');
  const [laborNote, setLaborNote] = useState('');
  const [startedAt, setStartedAt] = useState('');
  const [endedAt, setEndedAt] = useState('');
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const orders = data?.workOrders || [];
  const activeId = selectedId || orders[0]?.id || '';
  const current = orders.find((row) => row.id === activeId) || null;
  const assetsById = useMemo(() => new Map((data?.assets || []).map((asset) => [asset.id, asset])), [data?.assets]);
  const events = (data?.events || []).filter((row) => row.work_order_id === activeId).slice(0, 8);
  const labor = (data?.labor || []).filter((row) => row.work_order_id === activeId).slice(0, 8);
  const parts = (data?.parts || []).filter((row) => row.work_order_id === activeId);
  const partRequested = parts.reduce((sum, row) => sum + Number(row.quantity_requested || 0), 0);
  const partIssued = parts.reduce((sum, row) => sum + Number(row.quantity_issued || 0), 0);
  const partInstalled = parts.reduce((sum, row) => sum + Number(row.quantity_installed || 0), 0);

  async function action(payload: Record<string, unknown>, success: string) {
    setSaving(true); setMessage(null);
    const response = await fetch('/api/field/work-orders', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ workOrderId: activeId, ...payload }),
    });
    const body = await response.json().catch(() => null);
    setSaving(false);
    if (!response.ok) { setMessage(body?.error || 'No se pudo guardar.'); return false; }
    setMessage(success);
    await mutate();
    return true;
  }

  async function submitNote(event: FormEvent) {
    event.preventDefault();
    if (!note.trim()) return;
    const ok = await action({ action: 'note', note: note.trim() }, 'Nota de terreno registrada.');
    if (ok) setNote('');
  }

  async function submitLabor(event: FormEvent) {
    event.preventDefault();
    if (!startedAt || !endedAt) return;
    const ok = await action({ action: 'labor', startedAt, endedAt, note: laborNote.trim() || null }, 'Intervalo de trabajo registrado.');
    if (ok) { setStartedAt(''); setEndedAt(''); setLaborNote(''); }
  }

  if (error) return <div className="p-6 text-sm text-muted-foreground">No se pudo cargar la operación en terreno.</div>;

  return <div className="mx-auto max-w-3xl space-y-5 pb-12">
    <section className="flex items-end justify-between gap-3 border-b border-border/70 pb-5">
      <div><p className="text-sm font-medium text-muted-foreground">Mantenimiento</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Mi trabajo en terreno</h1><p className="mt-2 text-sm text-muted-foreground">Solo tus OT asignadas. Los cambios se guardan directamente en los registros operacionales.</p></div>
      <Button size="icon" variant="outline" onClick={() => void mutate()}><RefreshCw className="h-4 w-4" /></Button>
    </section>

    <Card className="shadow-none"><CardContent className="flex items-center gap-3 p-4"><UserRound className="h-5 w-5 text-muted-foreground" /><div><p className="font-medium">{data?.person?.full_name || 'Usuario sin persona vinculada'}</p><p className="text-xs text-muted-foreground">{data?.person?.role_title || data?.message || 'Sin cargo registrado'}</p></div></CardContent></Card>

    {message && <Card className="shadow-none"><CardContent className="p-4 text-sm">{message}</CardContent></Card>}

    {isLoading ? <div className="py-10 text-center text-sm text-muted-foreground">Cargando…</div> : orders.length === 0 ? <Card className="shadow-none"><CardContent className="p-8 text-center text-sm text-muted-foreground">{data?.message || 'No tienes OT activas asignadas.'}</CardContent></Card> : <>
      <div className="space-y-2"><Label>Orden activa</Label><Select value={activeId} onValueChange={setSelectedId}><SelectTrigger className="h-12"><SelectValue /></SelectTrigger><SelectContent>{orders.map((row) => <SelectItem key={row.id} value={row.id}>{row.work_order_number || 'OT'} · {row.title || 'Sin título'}</SelectItem>)}</SelectContent></Select></div>

      {current && <Card className="shadow-none"><CardHeader><div className="flex flex-wrap items-center gap-2"><Badge variant="outline">{statusLabel(current.status)}</Badge>{current.priority && <Badge variant="outline">{current.priority}</Badge>}{current.scheduled_date && <Badge variant="secondary">{current.scheduled_date}</Badge>}</div><CardTitle className="mt-3 text-xl">{current.work_order_number || 'OT'} · {current.title || 'Sin título'}</CardTitle></CardHeader><CardContent className="space-y-4"><p className="text-sm text-muted-foreground">{current.description || 'Sin descripción registrada.'}</p><div className="rounded-lg bg-muted/40 p-3 text-sm"><p className="font-medium">{current.canonical_asset_id ? assetsById.get(current.canonical_asset_id)?.asset_name || 'Equipo asociado' : 'Sin equipo asociado'}</p><p className="text-xs text-muted-foreground">{current.canonical_asset_id ? assetsById.get(current.canonical_asset_id)?.location || 'Sin ubicación' : 'La OT no posee activo canónico'}</p></div><div className="grid grid-cols-2 gap-3"><div className="rounded-lg border p-3"><Clock3 className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-lg font-semibold">{current.planned_duration_hours == null ? '—' : `${Number(current.planned_duration_hours).toLocaleString('es-CL')} h`}</p><p className="text-xs text-muted-foreground">Planificadas</p></div><div className="rounded-lg border p-3"><Package className="h-4 w-4 text-muted-foreground" /><p className="mt-2 text-lg font-semibold">{partInstalled}/{partRequested}</p><p className="text-xs text-muted-foreground">Repuestos instalados · {partIssued} entregados</p></div></div>{String(current.status || '').toLowerCase() !== 'in_progress' ? <Button className="w-full" asChild><a href={`/dashboard/mantenimiento/ordenes-trabajo/${current.id}`}><Play className="mr-2 h-4 w-4" />Iniciar desde la OT</a></Button> : null}<Button className="w-full" variant="outline" asChild><a href={`/dashboard/mantenimiento/ordenes-trabajo/${current.id}`}><Wrench className="mr-2 h-4 w-4" />Abrir OT completa, repuestos y cierre</a></Button></CardContent></Card>}

      <div className="grid gap-5 md:grid-cols-2">
        <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Nota de terreno</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={submitNote}><Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Qué ocurrió, qué encontraste o qué queda pendiente" rows={5} /><Button className="w-full" disabled={saving || !note.trim()}><FileText className="mr-2 h-4 w-4" />Guardar nota</Button></form></CardContent></Card>
        <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Registrar trabajo</CardTitle></CardHeader><CardContent><form className="space-y-3" onSubmit={submitLabor}><div className="space-y-2"><Label>Inicio</Label><Input type="datetime-local" value={startedAt} onChange={(event) => setStartedAt(event.target.value)} /></div><div className="space-y-2"><Label>Término</Label><Input type="datetime-local" value={endedAt} onChange={(event) => setEndedAt(event.target.value)} /></div><Textarea value={laborNote} onChange={(event) => setLaborNote(event.target.value)} placeholder="Trabajo realizado" rows={3} /><Button className="w-full" disabled={saving || !startedAt || !endedAt}><Clock3 className="mr-2 h-4 w-4" />Registrar intervalo</Button></form></CardContent></Card>
      </div>

      <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Actividad reciente</CardTitle></CardHeader><CardContent className="p-0">{events.length === 0 && labor.length === 0 ? <div className="p-8 text-center text-sm text-muted-foreground">Aún no hay actividad registrada en esta OT.</div> : <div className="divide-y border-t">{events.map((row) => <div key={`event-${row.id}`} className="p-4"><p className="text-sm font-medium">{row.summary || row.event_type}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.event_at).toLocaleString('es-CL')} · {row.actor_name || 'Usuario'}</p></div>)}{labor.map((row) => <div key={`labor-${row.id}`} className="p-4"><p className="text-sm font-medium">{row.hours == null ? 'Horas no informadas' : `${Number(row.hours).toLocaleString('es-CL')} h de trabajo`}</p><p className="mt-1 text-xs text-muted-foreground">{new Date(row.started_at).toLocaleString('es-CL')}{row.notes ? ` · ${row.notes}` : ''}</p></div>)}</div>}</CardContent></Card>
    </>}
  </div>;
}
