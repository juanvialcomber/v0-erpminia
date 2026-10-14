'use client';

import Link from 'next/link';
import useSWR from 'swr';
import { useState } from 'react';
import { ArrowLeft, ShieldCheck, FileText } from 'lucide-react';
import { HseEvidenceGraphSummary } from '@/components/legal/hse-evidence-graph-summary';

type ModuleLinkSummary = { target_module: string; links: number; pending: number; verified: number };
type Control = {
  id: string;
  rule_code: string;
  domain: string;
  obligation: string;
  responsible_role: string | null;
  evidence_excerpt: string;
  validation_status: string;
  source_file_path: string;
};
const CONTROL_LABELS: Record<string, string> = {
  'RTIMIN-2.1': 'Mantener actualizado el registro de conductores autorizados para ingresar a la mina.',
  'RTIMIN-5.1.2': 'Todo conductor debe contar con licencia interna de conducción vigente.',
  'RTIMIN-5.6.5': 'La velocidad máxima interior es de 20 km/h, o menor según señalización o condiciones.',
};
const DOMAINS: Record<string, string> = {
  transport: 'Tránsito y conducción', emergency: 'Emergencias',
  ground_control: 'Fortificación', drilling: 'Perforación',
  personal_protection: 'Protección personal', general_hse: 'Seguridad y salud',
};
function sourceTitle(path: string): string {
  const name = path.split('/').pop() || '';
  return name.replace(/^\d+_/, '').replace(/\.(pdf|docx?|xlsx?)$/i, '')
    .replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
}
const fetcher = async (url: string): Promise<{ controls: Control[]; moduleLinks: ModuleLinkSummary[]; readOnly: boolean }> => {
  const res = await fetch(url, { credentials: 'include' });
  if (!res.ok) throw new Error('No fue posible consultar los controles HSE');
  return res.json();
};

export default function HseControlsPage() {
  const { data, error, isLoading, mutate } = useSWR('/api/legal/hse-controls', fetcher, { revalidateOnFocus: false });
  const controls = data?.controls || [];
  const [notes, setNotes] = useState<Record<string,string>>({});
  const [linkControl, setLinkControl] = useState<string>('');
  const [linkModule, setLinkModule] = useState<'assets'|'people'|'maintenance'>('assets');
  const [linkTarget, setLinkTarget] = useState('');
  const { data: targetData, error: targetError } = useSWR<{ options: Array<{id:string;label:string}> }>(
    data && !data.readOnly && controls.some(control => control.validation_status === 'verified') ? '/api/legal/hse-controls/targets?module=' + linkModule : null,
    async (url: string) => {
      const response = await fetch(url, { credentials: 'include' });
      if (!response.ok) throw new Error('No se pudieron cargar registros');
      return response.json();
    }
  );
  const [linkNote, setLinkNote] = useState('');
  async function proposeLink() {
    if (busy) return;
    setBusy('link'); setFeedback(null);
    try {
      const response = await fetch('/api/legal/hse-controls', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ controlId: linkControl, module: linkModule, targetId: linkTarget, note: linkNote }),
      });
      if (!response.ok) throw Error('Invalid link');
      setLinkTarget(''); setLinkNote(''); await mutate();
      setFeedback('Relación propuesta y pendiente de verificación.');
    } catch { setFeedback('No se pudo proponer la relación. Revise el control, la organización y el identificador de destino.'); }
    finally { setBusy(null); }
  }
  const [busy, setBusy] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all'|'pending'|'verified'|'rejected'>('pending');
  const visibleControls = controls.filter(control => filter === 'all' || control.validation_status === filter);
  async function review(id: string, status: 'verified' | 'rejected') {
    if (busy) return;
    const note = (notes[id] || '').trim();
    if (note.length < 5) { setFeedback('Indique un motivo de al menos cinco caracteres.'); return; }
    setBusy(id); setFeedback(null);
    try {
      const response = await fetch('/api/legal/hse-controls', { method: 'PATCH', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({id,status,note}) });
      if (!response.ok) throw Error('Review failed');
      await mutate();
      setNotes(previous => ({...previous,[id]:''}));
    } catch { setFeedback('No se guardó la revisión. Intente nuevamente.'); }
    finally { setBusy(null); }
  }
  return (
    <main className="mx-auto max-w-5xl space-y-6 px-4 py-6">
      <Link href="/dashboard/legal" className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Volver a Legal
      </Link>
      <header className="space-y-2">
        <div className="flex items-center gap-2"><ShieldCheck className="h-5 w-5" /><h1 className="text-2xl font-semibold">Revisión de controles HSE</h1></div>
        <p className="text-sm text-muted-foreground">Obligaciones extraídas de documentos fuente. Ninguna regla se aplica automáticamente sin validación.</p>
      </header>
      <div className="flex flex-wrap gap-3 text-sm">
        <div className="rounded-md border px-4 py-3"><strong>{controls.length}</strong> controles identificados</div>
        <div className="rounded-md border px-4 py-3"><strong>{controls.filter(c => c.validation_status === 'pending').length}</strong> pendientes</div>
        <div className="rounded-md border px-4 py-3">{data?.readOnly ? 'Consulta de solo lectura' : 'Revisión habilitada'}</div>
      </div>
      <HseEvidenceGraphSummary />
      <nav aria-label="Módulos relacionados" className="grid gap-2 sm:grid-cols-3">
        <Link href="/dashboard/mantenimiento/equipos" className="rounded-md border p-3 text-sm hover:bg-muted/30">
          <span className="font-medium">Activos de mantenimiento</span>
          <span className="mt-1 block text-xs text-muted-foreground">Consultar equipos y sus expedientes</span>
        </Link>
        <Link href="/dashboard/mantenimiento/ordenes-trabajo" className="rounded-md border p-3 text-sm hover:bg-muted/30">
          <span className="font-medium">Órdenes de trabajo</span>
          <span className="mt-1 block text-xs text-muted-foreground">Consultar ejecución y responsables</span>
        </Link>
        <Link href="/dashboard/mantenimiento/personal" className="rounded-md border p-3 text-sm hover:bg-muted/30">
          <span className="font-medium">Personal</span>
          <span className="mt-1 block text-xs text-muted-foreground">Consultar personas del módulo</span>
        </Link>
      </nav>
      <section className="space-y-3 rounded-lg border p-4">
        <h2 className="text-sm font-semibold">Relaciones con la operación</h2>
        <p className="text-xs text-muted-foreground">Conecte controles validados con personas, equipos y activos existentes. Cada vínculo exige evidencia y revisión.</p>
        {!controls.some(control => control.validation_status === 'verified') && !isLoading && !error && (
        <p className="rounded-md border border-dashed px-3 py-3 text-sm text-muted-foreground">
          Primero revise y valide un control en la bandeja inferior. Después podrá conectarlo con equipos, activos o personas existentes.
        </p>
      )}
      <div className="grid gap-2 sm:grid-cols-3">
          {(['assets','maintenance','people'] as const).map(module => {
            const row = data?.moduleLinks?.find(item => item.target_module === module);
            return <div key={module} className="rounded-md bg-muted/30 p-3 text-sm">
              <p className="font-medium">{{assets:'Activos',maintenance:'Mantenimiento',people:'Personas'}[module]}</p>
              <p className="text-xs text-muted-foreground">{row?.links || 0} vínculos · {row?.pending || 0} pendientes</p>
            </div>;
          })}
        </div>
        {!data?.readOnly && controls.some(control => control.validation_status === 'verified') && (
          <div className="grid gap-2 border-t pt-3 sm:grid-cols-2">
            <label className="text-xs">Control validado
              <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={linkControl} onChange={event=>setLinkControl(event.target.value)}>
                <option value="">Seleccione un control</option>
                {controls.filter(control=>control.validation_status==='verified').map(control=><option key={control.id} value={control.id}>{control.rule_code}</option>)}
              </select>
            </label>
            <label className="text-xs">Módulo
              <select className="mt-1 w-full rounded-md border bg-background p-2 text-sm" value={linkModule} onChange={event=>{setLinkModule(event.target.value as 'assets'|'people'|'maintenance');setLinkTarget('');}}>
                <option value="assets">Activos</option><option value="maintenance">Mantenimiento</option><option value="people">Personas</option>
              </select>
            </label>
            <label className="text-xs">Registro existente
              <select value={linkTarget} onChange={event=>setLinkTarget(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm">
                <option value="">Seleccione un registro real</option>
                {(targetData?.options || []).map(item=><option key={item.id} value={item.id}>{item.label}</option>)}
              </select>
              {targetError && <span className="text-xs text-destructive">No se pudieron cargar los registros</span>}
            </label>
            <label className="text-xs">Justificación y evidencia
              <input value={linkNote} onChange={event=>setLinkNote(event.target.value)} className="mt-1 w-full rounded-md border bg-background p-2 text-sm" placeholder="Indique por qué se relacionan" />
            </label>
            <button type="button" disabled={busy !== null || !linkControl || !linkTarget || linkNote.trim().length < 5} onClick={proposeLink} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50 sm:col-span-2">Proponer conexión para revisión</button>
          </div>
        )}
      </section>
      {isLoading && <p role="status" className="text-sm text-muted-foreground">Cargando evidencia HSE…</p>}
      {error && <div role="alert" className="rounded-md border p-4 text-sm">No fue posible cargar la información. <button className="underline" onClick={() => mutate()}>Reintentar</button></div>}
      {!isLoading && !error && !controls.length && <p className="rounded-md border p-4 text-sm">No hay controles HSE disponibles para esta organización.</p>}
      {feedback && <p role="alert" className="text-sm">{feedback}</p>}
      <section className="space-y-1">
        <h2 className="text-sm font-semibold">Controles por revisar</h2>
        <p className="text-xs text-muted-foreground">Confirme cada obligación contra la evidencia antes de conectarla con la operación.</p>
      </section>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar controles">
        {(['pending','verified','rejected','all'] as const).map(value => (
          <button key={value} type="button" onClick={() => setFilter(value)}
            aria-pressed={filter === value}
            className={`rounded-md border px-3 py-2 text-sm ${filter === value ? 'bg-muted font-semibold' : ''}`}>
            {{pending:'Pendientes',verified:'Validados',rejected:'Rechazados',all:'Todos'}[value]}
          </button>
        ))}
      </div>
      {!isLoading && !error && visibleControls.length === 0 && controls.length > 0 &&
        <p className="rounded-md border p-4 text-sm text-muted-foreground">No hay controles con este estado.</p>}
      <div className="space-y-3">
        {visibleControls.map(control => (
          <article id={'hse-control-' + control.id} key={control.id} className="scroll-mt-24 rounded-lg border p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-semibold">{control.rule_code}</h2>
              <span className="rounded-md border px-2 py-1 text-xs">{control.validation_status === 'pending' ? 'Pendiente de revisión' : control.validation_status}</span>
            </div>
            <p className="text-sm">{CONTROL_LABELS[control.rule_code] || control.obligation}</p>
            <p className="text-xs text-muted-foreground">Responsable propuesto: {control.responsible_role || 'Por determinar'} · Área: {DOMAINS[control.domain] || control.domain}</p>
            <div className="rounded-md bg-muted/40 p-3">
              <p className="mb-2 flex items-center gap-2 text-xs font-medium"><FileText className="h-3.5 w-3.5" /> Evidencia documental</p>
              <blockquote className="whitespace-pre-wrap break-words text-xs leading-relaxed">{control.evidence_excerpt}</blockquote>
              <p className="mt-3 break-all text-[11px] text-muted-foreground">{sourceTitle(control.source_file_path)}</p>
            </div>
            {!data?.readOnly && control.validation_status === 'pending' && (
              <div className="space-y-2 border-t pt-3">
                <label htmlFor={'review-'+control.id} className="text-xs font-medium">Motivo de la decisión</label>
                <textarea id={'review-'+control.id} className="w-full rounded-md border bg-background p-2 text-sm" rows={2}
                  value={notes[control.id] || ''} maxLength={2000}
                  onChange={event=>setNotes(previous=>({...previous,[control.id]:event.target.value}))}
                  placeholder="Explique la verificación realizada" />
                <div className="flex gap-2">
                  <button type="button" disabled={busy !== null} onClick={()=>review(control.id,'verified')} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Validar</button>
                  <button type="button" disabled={busy !== null} onClick={()=>review(control.id,'rejected')} className="rounded-md border px-3 py-2 text-sm disabled:opacity-50">Rechazar</button>
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
