'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { canRecordOperationalFinding, validOperationalClassification } from '@/lib/messages/whatsapp-finding-review.mjs';

type Finding = {
  detail: string;
  domain: string;
  confidence?: string;
  reported_state?: 'reported_done' | 'pending' | 'planned' | 'unclear';
  source_ids?: number[];
  review_status?: string;
  review_note?: string;
  operational_log_id?: string;
  operational_scope?: string;
  operational_category?: string;
};
type Report = {
  report_date: string;
  status: string;
  findings: Finding[];
};
type Source = {
  id: number;
  group_name: string;
  sender_name: string | null;
  body: string | null;
  message_type: string;
  occurred_at: string;
};
type Attachment = {
  id: string; message_id: number;
  download_status: string; scan_status: string;
  original_file_name?: string | null; mime_type?: string | null;
};
type Detail = {
  finding: Finding;
  sources: Source[];
  attachments: Attachment[];
  missingSources: number[];
  sourceComplete: boolean;
};
const statusLabel: Record<string,string> = {
  pending: 'Pendiente de revisión',
  needs_more_info: 'Requiere corroboración',
  confirmed: 'Evidencia revisada',
  dismissed: 'No aplicable',
};
const reportedStateLabel: Record<string,string> = {
  reported_done: 'Reportado como realizado',
  pending: 'Reportado pendiente',
  planned: 'Planificado',
  unclear: 'Estado no aclarado',
};
const scopeLabel: Record<string,string> = {
  plant:'Operación de planta',dispatch:'Despachos',general:'Operación general',
};
const categoryLabel: Record<string,string> = {
  plant_intervention:'Intervención de planta (no OT)',
  cleaning:'Limpieza / orden',
  process_adjustment:'Ajuste de proceso',
  process_reading:'Medición informada',
  pending_task:'Pendiente operacional',
  dispatch_coordination:'Coordinación de despacho',
  other:'Otra novedad',
};
const domainLabel: Record<string,string> = {
  maintenance: 'Intervención informada (revisar ámbito)',
  plant_operations: 'Operación de planta',
  plant_intervention: 'Intervención de planta',
  plant_process: 'Proceso de planta',
  dispatch: 'Despachos',
  machine_maintenance: 'Mantenimiento de maquinaria (separado)',
  hse: 'Seguridad y salud',
  production: 'Producción',
  procurement: 'Compras',
  people: 'Personas',
  other: 'Operación',
};

export function WhatsappFindingReview({
  report, onReviewed,
}: { report: Report; onReviewed: () => Promise<void> }) {
  const [activeIndex, setActiveIndex] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [scope, setScope] = useState('');
  const [category, setCategory] = useState('');
  const [reportedState, setReportedState] = useState('');
  const [confirmedClassification, setConfirmedClassification] = useState(false);

  useEffect(() => {
    if (activeIndex === null) return;
    const controller = new AbortController();
    async function load() {
      setLoading(true); setDetail(null); setError('');
      try {
        const url = '/api/admin/whatsapp/findings?date=' +
          encodeURIComponent(report.report_date) + '&index=' + activeIndex;
        const response = await fetch(url, {
          credentials: 'include', cache: 'no-store', signal: controller.signal,
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.finding) {
          throw new Error(payload?.error || 'No se pudo consultar la evidencia.');
        }
        if (!controller.signal.aborted) setDetail(payload as Detail);
      } catch (cause) {
        if (!controller.signal.aborted) {
          setError(cause instanceof Error ? cause.message : 'No se pudo obtener la evidencia.');
        }
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }
    void load();
    return () => controller.abort();
  }, [activeIndex, report.report_date]);

  const findings = Array.isArray(report.findings) ? report.findings : [];
  const reviewed = findings.filter(f => f.review_status === 'confirmed' || f.review_status === 'dismissed').length;
  const selected = activeIndex === null ? null : findings[activeIndex];
  const canDecide = report.status === 'ready' && selected && (!selected.review_status || selected.review_status === 'pending' ||
    selected.review_status === 'needs_more_info');
  const canRecord = report.status === 'ready' && canRecordOperationalFinding(selected);

  async function recordOperationally() {
    if (activeIndex === null || saving || !canRecord || !detail?.sourceComplete ||
        !confirmedClassification || !validOperationalClassification(scope,category,reportedState)) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/whatsapp/operational-log',{
        method:'POST',credentials:'include',cache:'no-store',
        headers:{'Content-Type':'application/json'},
        body:JSON.stringify({
          reportDate: report.report_date, findingIndex: activeIndex,
          scope, category, reportedState,
        }),
      });
      const data = await response.json().catch(()=>null);
      if(!response.ok || !data?.ok) throw new Error(data?.error ||
        'No se pudo registrar el hecho informado en la bitácora.');
      await onReviewed();
      setConfirmedClassification(false);
    } catch(cause) {
      setError(cause instanceof Error ? cause.message : 'Error al registrar la observación.');
    } finally { setSaving(false); }
  }

  function open(index: number) {
    setActiveIndex(current => current === index ? null : index);
    setNote(''); setError(''); setDetail(null);
    setScope('');setCategory('');setReportedState('');
    setConfirmedClassification(false);
  }

  async function decide(decision: 'confirmed' | 'needs_more_info' | 'dismissed') {
    if (activeIndex === null || saving || note.trim().length < 8) return;
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/admin/whatsapp/findings', {
        method: 'POST', credentials: 'include', cache: 'no-store',
        headers: {'Content-Type':'application/json'},
        body: JSON.stringify({
          reportDate: report.report_date, findingIndex: activeIndex,
          decision, note: note.trim(),
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        throw new Error(payload?.error || 'No se pudo guardar la revisión.');
      }
      setNote('');
      await onReviewed();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Error al guardar la revisión.');
    } finally {
      setSaving(false);
    }
  }

  return <section className="space-y-3" aria-label={'Hallazgos del ' + report.report_date}>
    <p className="text-xs text-muted-foreground">
      {findings.length} hallazgos · {reviewed} revisados.
      La actividad de planta no es una OT de maquinaria. Cada hallazgo es información externa
      y no modifica automáticamente KPI de producción, estados de equipos ni HSE.
    </p>
    <div className="divide-y rounded-lg border">
      {findings.map((finding, index) => {
        const current = finding.review_status || 'pending';
        const expanded = activeIndex === index;
        return <article className="p-3 sm:p-4" key={report.report_date + '-' + index}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {domainLabel[finding.domain] || 'Operación'} · {statusLabel[current] || current}
                {finding.reported_state ? ' · ' + (reportedStateLabel[finding.reported_state] || 'Estado no aclarado') : ''}
              </p>
              <p className="text-sm">{finding.detail}</p>
              <p className="text-xs text-muted-foreground">
                {Array.isArray(finding.source_ids) ? finding.source_ids.length : 0} mensaje(s) de origen
              </p>
            </div>
            <Button type="button" size="sm" variant="outline" onClick={() => open(index)}
              aria-expanded={expanded} aria-controls={'finding-detail-' + report.report_date + '-' + index}>
              {expanded ? 'Cerrar' : 'Revisar'}
            </Button>
          </div>
          {expanded ? <div id={'finding-detail-' + report.report_date + '-' + index}
              className="mt-4 space-y-4 border-t pt-4">
            {loading ? <p role="status" className="text-sm text-muted-foreground">Cargando mensajes originales…</p> : null}
            {error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}
            {detail ? <>
              {!detail.sourceComplete ? <p className="text-sm text-destructive">
                Faltan mensajes de origen. No confirmes el hallazgo hasta recuperar la evidencia.
              </p> : null}
              <div className="space-y-3">
                {detail.sources.map(source => <div key={source.id} className="space-y-1 rounded-md bg-muted/30 p-3 text-sm">
                  <p className="text-xs font-medium text-muted-foreground">
                    {source.group_name} · {new Date(source.occurred_at).toLocaleString('es-CL',
                      { timeZone:'America/Santiago' })} · Mensaje #{source.id}
                  </p>
                  <p className="whitespace-pre-wrap break-words">{source.body || 'Archivo o mensaje sin texto extraíble.'}</p>
                </div>)}
                {detail.attachments.map(item => <div key={item.id} className="flex items-center justify-between gap-3 text-xs">
                  <span>{item.original_file_name || item.mime_type || 'Evidencia multimedia'} · {item.scan_status}</span>
                  {item.download_status === 'stored' ? <a className="underline" target="_blank"
                    rel="noopener noreferrer" href={'/api/admin/whatsapp/evidence/' + encodeURIComponent(item.id) + '?file=1'}>
                    Abrir original
                  </a> : null}
                </div>)}
              </div>
              {selected?.review_note ? <p className="text-xs text-muted-foreground">
                Última revisión: {selected.review_note}
              </p> : null}
              {canDecide ? <div className="space-y-2">
                <label htmlFor={'finding-note-' + index} className="text-sm font-medium">
                  Comentario de verificación
                </label>
                <Textarea id={'finding-note-' + index} value={note} onChange={event => setNote(event.target.value)}
                  minLength={8} maxLength={500} placeholder="Qué comprobaste, qué falta o por qué no corresponde"
                  rows={3} />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={saving || !detail.sourceComplete || note.trim().length < 8}
                    onClick={() => void decide('confirmed')}>Corroborar contenido</Button>
                  {selected?.review_status !== 'needs_more_info' ? <Button size="sm" variant="outline"
                    disabled={saving || note.trim().length < 8}
                    onClick={() => void decide('needs_more_info')}>Solicitar validación</Button> : null}
                  <Button size="sm" variant="outline" disabled={saving || note.trim().length < 8}
                    onClick={() => void decide('dismissed')}>Descartar</Button>
                </div>
                <p className="text-xs text-muted-foreground">
                  Corroborar un mensaje no certifica que el trabajo se haya ejecutado.
                  La bitácora mantiene el estado que fue reportado, separado de su verificación física.
                </p>
              </div> : null}
              {selected?.operational_log_id ? <div className="rounded-md border p-3 text-sm">
                <p className="font-medium">Registrado en bitácora operacional</p>
                <p className="text-xs text-muted-foreground">
                  {scopeLabel[selected.operational_scope || ''] || 'Operación'}
                  {' · '}{categoryLabel[selected.operational_category || ''] || 'Observación'}
                  {' · '}No es OT de maquinaria ni registro certificado de producción.
                </p>
              </div> : null}
              {canRecord ? <div className="space-y-3 rounded-md border p-3"
                aria-label="Registrar en bitácora operacional">
                <p className="text-sm font-medium">Registrar hallazgo en bitácora operacional</p>
                <p className="text-xs text-muted-foreground">
                  Confirma a qué proceso pertenece y qué estado declara el mensaje.
                  No crea OT, no registra horas de máquina y no cambia métricas canónicas.
                </p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Ámbito de operación</label>
                    <Select value={scope} onValueChange={value=>{
                      setScope(value); setCategory(''); setConfirmedClassification(false);
                    }}>
                      <SelectTrigger aria-label="Ámbito operacional"><SelectValue placeholder="Elegir ámbito" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(scopeLabel).map(([id,name])=>
                          <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-medium">Tipo de novedad</label>
                    <Select value={category} onValueChange={value=>{
                      setCategory(value);setConfirmedClassification(false);
                    }}>
                      <SelectTrigger aria-label="Tipo de actividad"><SelectValue placeholder="Elegir tipo" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(categoryLabel).filter(([id])=>
                          scope==='dispatch' ? ['dispatch_coordination','other'].includes(id) :
                          id!=='dispatch_coordination').map(([id,name])=>
                            <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <label className="text-xs font-medium">Estado expresado en el mensaje</label>
                    <Select value={reportedState} onValueChange={value=>{
                      setReportedState(value);setConfirmedClassification(false);
                    }}>
                      <SelectTrigger aria-label="Estado reportado"><SelectValue placeholder="Revisar estado de origen" /></SelectTrigger>
                      <SelectContent>
                        {Object.entries(reportedStateLabel).map(([id,name])=>
                          <SelectItem key={id} value={id}>{name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <label className="flex items-start gap-2 text-xs">
                  <input type="checkbox" checked={confirmedClassification}
                    onChange={event=>setConfirmedClassification(event.target.checked)}
                    className="mt-0.5" />
                  Corroboré que el ámbito y el estado elegidos corresponden a estos mensajes.
                  Registrar no certifica el trabajo físico.
                </label>
                <Button size="sm" disabled={saving || !detail.sourceComplete ||
                    !confirmedClassification || !validOperationalClassification(scope,category,reportedState)}
                  onClick={()=>void recordOperationally()}>
                  Registrar en bitácora operacional
                </Button>
              </div> : null}
            </> : null}
          </div> : null}
        </article>;
      })}
    </div>
  </section>;
}
