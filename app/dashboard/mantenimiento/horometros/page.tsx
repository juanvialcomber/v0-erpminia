'use client';

import { useMemo, useState } from 'react';
import useSWR from 'swr';
import { AlertTriangle, Gauge, RefreshCw } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageHeader, PageHeaderActions, PageHeaderContent, PageHeaderDescription, PageHeaderEyebrow, PageHeaderTitle } from '@/components/ui/page-header';
import { StatePanel } from '@/components/ui/state-panel';

const fetcher = async (url: string) => { const response = await fetch(url, { credentials: 'include', cache: 'no-store' }); const payload = await response.json().catch(() => null); if (!response.ok) throw new Error(payload?.error || 'No se pudieron cargar los horómetros'); return payload; };
const number = (value: unknown) => value == null ? '—' : new Intl.NumberFormat('es-CL', { maximumFractionDigits: 2 }).format(Number(value));
const money = (value: unknown) => value == null ? '—' : new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', maximumFractionDigits: 0 }).format(Number(value));

export default function RuntimeReadingsPage() {
  const { data: viewer } = useSWR('/api/maintenance/viewer-context', fetcher, { revalidateOnFocus: false });
  const isMechanic = viewer?.mode === 'execution';
  const { data, error, isLoading, mutate } = useSWR('/api/maintenance/runtime-readings', fetcher, { revalidateOnFocus: false });
  const { data: audit, mutate: refreshAudit } = useSWR(!isMechanic ? '/api/maintenance/runtime-readings/history' : null, fetcher, { revalidateOnFocus: false });
  const [assetId, setAssetId] = useState('');
  const [meterHours, setMeterHours] = useState('');
  const [photo, setPhoto] = useState<File | null>(null);
  const [analyzingPhoto, setAnalyzingPhoto] = useState(false);
  const [photoMessage, setPhotoMessage] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [submissionId, setSubmissionId] = useState(() => crypto.randomUUID());
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const runtimeWithEvidence = useMemo(() => (data?.runtime || []).filter((row: any) => Number(row.reading_count || 0) > 0), [data]);
  const reconciliationQueue = Array.isArray(data?.reconciliationQueue) ? data.reconciliationQueue : [];

  function reviewAsset(item: any) {
    setAssetId(item.canonical_asset_id);
    setMeterHours('');
    setPhoto(null);
    document.getElementById('registrar-lectura')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  async function analyzeMeterPhoto(file: File) {
    setAnalyzingPhoto(true);
    setPhotoMessage('Leyendo horómetro con IA...');
    try {
      if (!assetId) {
        setPhotoMessage('Selecciona primero el equipo.');
        return;
      }
      const form = new FormData();
      form.set('canonicalAssetId', assetId);
      form.set('photo', file);
      const response = await fetch('/api/maintenance/runtime-readings/analyze-photo', {
        method: 'POST', credentials: 'include', body: form,
      });
      const result = await response.json().catch(() => null);
      if (!response.ok) throw new Error(result?.error || 'No se pudo analizar la foto.');
      if (typeof result?.meterHours === 'number') {
        setMeterHours(String(result.meterHours));
        setPhotoMessage('Lectura detectada: comprueba las horas antes de guardar.');
      } else {
        setPhotoMessage(result?.message || 'Escribe las horas que muestra la foto.');
      }
    } catch (cause) {
      setPhotoMessage(cause instanceof Error ? cause.message : 'Escribe las horas manualmente.');
    } finally {
      setAnalyzingPhoto(false);
    }
  }

  async function saveReading() {
    setActionMessage(null);
    if (!assetId || !meterHours) return setActionMessage('Selecciona equipo e ingresa las horas.');
    setSaving(true);
    try {
      const form = new FormData();
      form.set('canonicalAssetId', assetId);
      form.set('meterHours', meterHours);
      form.set('submissionId', submissionId);
      if (photo) form.set('photo', photo);
      const response = await fetch('/api/maintenance/runtime-readings/capture', {
        method: 'POST', credentials: 'include', body: form,
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || 'No se pudo registrar la lectura');
      setMeterHours(''); setPhoto(null); setSubmissionId(crypto.randomUUID());
      const alerts = Array.isArray(payload?.preventiveAlerts) ? payload.preventiveAlerts : [];
      setActionMessage(payload?.resetDetected
        ? 'Lectura guardada. Posible reinicio del contador: requiere revisión y no se usará para tasas.'
        : alerts.length > 0
          ? `Lectura guardada. ${alerts.length} alerta(s) de mantenimiento preventivo por horas para este equipo.`
          : payload?.alertsEvaluation === 'unavailable'
            ? 'Lectura guardada. No fue posible verificar las alertas; revisa Planificación.'
            : 'Lectura guardada.');
      await Promise.all([mutate(), refreshAudit()]);
    } catch (cause) {
      setActionMessage(cause instanceof Error ? cause.message : 'No se pudo registrar la lectura');
    } finally { setSaving(false); }
  }

  return <div className="mx-auto w-full max-w-[1600px] space-y-6">
    <PageHeader>
      <PageHeaderContent>
        <PageHeaderEyebrow>{isMechanic ? 'Mantenimiento · registro diario' : 'Mantenimiento · evidencia operacional'}</PageHeaderEyebrow>
        <PageHeaderTitle>{isMechanic ? 'Registrar horómetro' : 'Qué lectura falta para planificar con confianza'}</PageHeaderTitle>
        <PageHeaderDescription>{isMechanic ? 'Elige tu máquina, toma una foto, revisa las horas y guarda la lectura.' : 'Prioriza equipos sin lectura observada o con contador inconsistente. MOTIL conserva snapshots históricos como evidencia y nunca corrige ni proyecta un horómetro automáticamente.'}</PageHeaderDescription>
      </PageHeaderContent>
      <PageHeaderActions><Button variant="outline" onClick={() => void mutate()} disabled={isLoading}><RefreshCw className="h-4 w-4"/>Actualizar</Button></PageHeaderActions>
    </PageHeader>

    {error ? <StatePanel tone="error" title="No se pudieron cargar los horómetros" description={error.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} className="min-h-0 py-5"/> : null}

    <Card id="registrar-lectura" className="scroll-mt-24 shadow-none">
      <CardHeader><CardTitle className="text-lg">{isMechanic ? 'Lectura de hoy' : 'Registrar lectura observada'}</CardTitle><CardDescription>{isMechanic ? 'Selecciona una máquina y fotografía el contador. Confirma las horas antes de guardar.' : 'Elige el equipo, escribe las horas y, si puedes, toma una foto. La fecha se guarda automáticamente.'}</CardDescription></CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-[1fr_160px]">
        <Select value={assetId} onValueChange={setAssetId}><SelectTrigger><SelectValue placeholder="Elegir equipo"/></SelectTrigger><SelectContent>{(data?.assets || []).map((asset: any) => <SelectItem key={asset.id} value={asset.id}>{asset.asset_code ? `${asset.asset_code} · ` : ''}{asset.name || 'Sin nombre'}</SelectItem>)}</SelectContent></Select>
        <Input aria-label="Horas del horómetro" type="number" min="0" step="0.1" inputMode="decimal" value={meterHours} onChange={(event) => setMeterHours(event.target.value)} placeholder="Horas"/>
        <label className="flex min-h-12 cursor-pointer items-center justify-center rounded-md border px-4 text-sm sm:col-span-2">
          {photo ? `Foto lista: ${photo.name}` : 'Tomar foto del horómetro (opcional)'}
          <input className="sr-only" type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif" capture="environment" onChange={(event) => { const file = event.target.files?.[0] || null; setPhoto(file); setPhotoMessage(null); if (file) void analyzeMeterPhoto(file); }}/>
        </label>
        {photoMessage ? <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{photoMessage}</p> : null}
        <Button className="min-h-12 sm:col-span-2" onClick={() => void saveReading()} disabled={saving || analyzingPhoto || !data?.canEdit}>{saving ? 'Guardando...' : 'Guardar lectura'}</Button>
        {actionMessage ? <p role="status" className="text-sm text-muted-foreground sm:col-span-2">{actionMessage}</p> : null}
      </CardContent>
    </Card>

    {!isMechanic ? <>
    <section aria-label="Estado de evidencia de horómetro" className="grid gap-px overflow-hidden rounded-lg border bg-border sm:grid-cols-3">
      <Metric label="Equipos con lectura" value={isLoading ? null : runtimeWithEvidence.length} detail="Observación registrada"/>
      <Metric label="Con tasa utilizable" value={isLoading ? null : runtimeWithEvidence.filter((row: any) => row.usable_for_rate_metrics).length} detail="Base suficiente"/>
      <Metric label="Por reconciliar" value={isLoading ? null : reconciliationQueue.length} detail="Requieren evidencia humana"/>
    </section>

    {!isLoading && !error && reconciliationQueue.length > 0 ? <Card className="shadow-none">
      <CardHeader><CardTitle className="text-lg">Qué requiere reconciliación</CardTitle><CardDescription>Primero, resolver evidencia pendiente. Estos equipos no tienen una base suficientemente confiable para planificación por horas; no corregir automáticamente el contador.</CardDescription></CardHeader>
      <CardContent className="p-0"><div className="divide-y">{reconciliationQueue.map((item: any, index: number) => <div key={item.canonical_asset_id} className="grid gap-3 p-4 md:grid-cols-[40px_minmax(0,1fr)_auto] md:items-center"><span className="text-xs tabular-nums text-muted-foreground">#{index + 1}</span><div className="min-w-0"><div className="flex flex-wrap gap-2"><Badge variant={item.reason === 'meter_below_last_execution' ? 'destructive' : 'secondary'}>{item.reason === 'meter_below_last_execution' ? 'Contador inconsistente' : 'Sin lectura observada'}</Badge><Badge variant="outline">{item.affected_tasks.length} pauta(s) afectada(s)</Badge></div><p className="mt-2 font-medium">{item.asset_code ? `${item.asset_code} · ` : ''}{item.asset_name}</p><p className="mt-1 text-sm text-muted-foreground">Snapshot: {number(item.source_meter_snapshot)} h · Última ejecución: {number(item.last_executed_meter)} h · Lectura observada: {number(item.latest_runtime_meter)} h</p><p className="mt-1 text-xs text-muted-foreground">Fuente: {item.source_reference || 'sin referencia explícita'}.</p></div><Button size="sm" variant="outline" onClick={() => reviewAsset(item)}>Registrar evidencia</Button></div>)}</div></CardContent>
    </Card> : !isLoading && !error ? <StatePanel tone="neutral" title="Sin reconciliaciones pendientes" description="Las fuentes actuales no muestran equipos que requieran corregir o confirmar la base de horómetro." className="min-h-0 py-5"/> : null}



    <Card className="shadow-none"><CardHeader><CardTitle className="text-lg">Base observada por equipo</CardTitle><CardDescription>Se muestran sólo activos con al menos una lectura registrada. Ausencia de lectura no equivale a cero horas.</CardDescription></CardHeader><CardContent className="p-0">{isLoading ? <StatePanel tone="loading" title="Cargando lecturas" className="min-h-64 border-0 bg-transparent"/> : !error && runtimeWithEvidence.length === 0 ? <StatePanel tone="neutral" title="Aún no existen lecturas reales de horómetro" description="No se calculan tasas de confiabilidad ni costo por hora sin esta evidencia." className="min-h-64 border-0 bg-transparent"/> : !error ? <div className="divide-y">{runtimeWithEvidence.map((row: any) => <div key={row.canonical_asset_id} className="grid gap-3 p-4 md:grid-cols-[1.4fr_repeat(3,minmax(0,1fr))]"><div><p className="font-medium">{row.asset_code ? `${row.asset_code} · ` : ''}{row.asset_name}</p><p className="text-xs text-muted-foreground">{row.reading_count} lectura{Number(row.reading_count) === 1 ? '' : 's'}</p></div><div><p className="text-xs text-muted-foreground">Horómetro actual</p><p className="font-medium">{number(row.latest_meter_hours)} h</p></div><div><p className="text-xs text-muted-foreground">Costo auditado / h</p><p className="font-medium">{row.audited_cost_per_operating_hour == null ? 'Sin base suficiente' : money(row.audited_cost_per_operating_hour)}</p></div><div><p className="text-xs text-muted-foreground">Calidad</p><p className="font-medium">{row.usable_for_rate_metrics ? 'Utilizable' : 'Insuficiente'}</p>{Number(row.reset_count || 0) > 0 ? <p className="text-xs text-muted-foreground"><AlertTriangle className="mr-1 inline h-3 w-3"/>{row.reset_count} reinicio(s) excluido(s)</p> : null}</div></div>)}</div> : null}</CardContent></Card>

    {audit?.rows?.length ? <Card className="shadow-none">
      <CardHeader><CardTitle className="text-lg">Historial de lecturas</CardTitle><CardDescription>Registro de quién ingresó cada horómetro, cuándo y con qué evidencia. Lecturas anteriores conservadas.</CardDescription></CardHeader>
      <CardContent className="divide-y p-0">{audit.rows.slice(0, 30).map((reading: any) => <div key={reading.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-sm">
        <div><p className="font-medium">{number(reading.meter_hours)} h · {new Date(reading.recorded_at).toLocaleString('es-CL')}</p><p className="text-xs text-muted-foreground">{reading.recorded_by_label} · {reading.asset_label}</p></div>
        {reading.photo_url ? <a className="underline" href={reading.photo_url} target="_blank" rel="noopener noreferrer">Ver fotografía</a> : <span className="text-xs text-muted-foreground">Sin fotografía</span>}
      </div>)}</CardContent>
    </Card> : null}

    <div className="border-t pt-4 text-xs leading-5 text-muted-foreground"><Gauge className="mr-1 inline h-3.5 w-3.5"/>Una lectura faltante se presenta como desconocida, nunca como 0. Los reinicios se preservan como evidencia y se excluyen de métricas hasta revisión.</div>
    </> : null}
  </div>;
}

function Metric({label,value,detail}:{label:string;value:number|null;detail:string}) {
  return <div className="bg-card px-4 py-4"><p className="text-xs text-muted-foreground">{label}</p><div className="mt-2 flex items-end justify-between gap-3"><p className="text-3xl font-semibold tracking-tight tabular-nums">{value == null ? '—' : value}</p><p className="max-w-36 text-right text-xs leading-4 text-muted-foreground">{detail}</p></div></div>;
}
