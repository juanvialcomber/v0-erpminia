'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import useSWR from 'swr';
import { AlertCircle, ArrowRight, Camera, CheckCircle2 } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import type { Dictionary, Locale } from '@/lib/i18n/dictionaries';
import { formatAssetIdentity, formatWorkOrderNumber } from '@/lib/maintenance/work-order-display';
import { createClient as createSupabaseClient } from '@/lib/supabase/client';

type QueueRow = {
  work_order_id: string;
  work_order_number: string | null;
  title: string | null;
  status: string | null;
  priority: string | null;
  work_type: string | null;
  root_cause: string | null;
  preventive_actions: string | null;
  actual_duration_hours: number | string | null;
  runtime_evidence_status: string | null;
  standard_plan_steps_total: number | string | null;
  standard_plan_steps_completed: number | string | null;
  next_plan_step_id: string | null;
  next_plan_step_sequence: number | null;
  next_plan_step_title: string | null;
  next_plan_step_instructions: string | null;
  next_action: string;
  asset?: { id: string; asset_code: string | null; name: string | null } | null;
};

type QueueResponse = {
  queue?: QueueRow[];
  canEdit?: boolean;
};

type EvidenceResponse = {
  evidence?: Array<{
    id: string;
    file_name: string;
    created_at: string;
    signed_url?: string | null;
  }>;
};

type CloseQueueT = Dictionary['app']['workOrderCloseQueue'];

const ACTION_KEYS: Record<string, keyof CloseQueueT['actionTitles']> = {
  resolve_asset: 'resolveAsset',
  resolve_procurement: 'resolveProcurement',
  resolve_parts: 'resolveParts',
  declare_materials: 'declareMaterials',
  define_materials: 'defineMaterials',
  resolve_materials: 'resolveMaterials',
  resolve_external_services: 'resolveExternalServices',
  resolve_labor: 'resolveLabor',
  reconcile_external_cost: 'reconcileExternalCost',
  complete_standard_plan_step: 'completeStandardPlanStep',
  record_root_cause: 'recordRootCause',
  record_preventive_actions: 'recordPreventiveActions',
  record_actual_hours: 'recordActualHours',
  record_runtime_evidence: 'recordRuntimeEvidence',
  close_work_order: 'closeWorkOrder',
};

function fill(template: string, vars: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(vars[key] ?? ''));
}

const fetcher = async (url: string) => {
  const response = await fetch(url, { credentials: 'include' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'request failed');
  return payload;
};

function localDateTimeValue() {
  const now = new Date();
  const local = new Date(now.getTime() - now.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

export function ProgressiveWorkOrderCloseQueue({ locale, dictionary }: { locale: Locale; dictionary: Dictionary }) {
  const t = dictionary.app.workOrderCloseQueue;
  const numberLocale = locale === 'en' ? 'en-US' : 'es-CL';
  const searchParams = useSearchParams();
  const selectedWorkOrderId = searchParams.get('workOrderId');
  const { data, error, isLoading, mutate } = useSWR<QueueResponse>(
    '/api/maintenance/work-order-close-queue',
    fetcher,
    { revalidateOnFocus: false },
  );

  const rawQueue = Array.isArray(data?.queue) ? data.queue : [];
  const queue = useMemo(
    () => selectedWorkOrderId
      ? [...rawQueue].sort((a, b) => a.work_order_id === selectedWorkOrderId ? -1 : b.work_order_id === selectedWorkOrderId ? 1 : 0)
      : rawQueue,
    [rawQueue, selectedWorkOrderId],
  );
  const current = queue[0] || null;

  const { data: evidenceData, mutate: mutateEvidence } = useSWR<EvidenceResponse>(
    current ? `/api/maintenance/work-orders/${current.work_order_id}/evidence` : null,
    fetcher,
    { revalidateOnFocus: false },
  );
  const evidence = evidenceData?.evidence || [];
  const evidenceCount = evidence.length;

  const [textValue, setTextValue] = useState('');
  const [hoursValue, setHoursValue] = useState('');
  const [stepObservation, setStepObservation] = useState('');
  const [meterMode, setMeterMode] = useState<'meter_reading' | 'not_available'>('meter_reading');
  const [meterValue, setMeterValue] = useState('');
  const [meterRecordedAt, setMeterRecordedAt] = useState(localDateTimeValue());
  const [meterReason, setMeterReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploadingEvidence, setUploadingEvidence] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  useEffect(() => {
    setActionError(null);
    setTextValue('');
    setHoursValue('');
    setStepObservation('');
    setMeterMode('meter_reading');
    setMeterValue('');
    setMeterRecordedAt(localDateTimeValue());
    setMeterReason('');
  }, [current?.work_order_id, current?.next_action, current?.next_plan_step_id]);

  async function request(url: string, body: Record<string, unknown>) {
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t.errors.saveFailed);
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t.errors.saveFailed);
    } finally {
      setSaving(false);
    }
  }

  async function patchCurrent(body: Record<string, unknown>) {
    if (!current) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${current.work_order_id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t.errors.updateFailed);
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t.errors.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function uploadEvidence(files: FileList | null) {
    if (!current || !files?.length) return;
    setUploadingEvidence(true);
    setActionError(null);
    try {
      const supabase = createSupabaseClient();
      for (const file of Array.from(files)) {
      const prepareResponse = await fetch(`/api/maintenance/work-orders/${current.work_order_id}/evidence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_upload',
          fileName: file.name || 'foto.jpg',
          mimeType: file.type || '',
          sizeBytes: file.size,
        }),
      });
      const prepared = await prepareResponse.json().catch(() => null);
      if (!prepareResponse.ok) throw new Error(prepared?.error || 'No se pudo preparar la foto.');

      const upload = prepared?.upload;
      if (!upload?.storagePath || !upload?.token || !upload?.evidenceId) {
        throw new Error('No se pudo preparar la subida de la foto.');
      }

      const { error: uploadError } = await supabase.storage
        .from('maintenance-work-order-evidence')
        .uploadToSignedUrl(upload.storagePath, upload.token, file, {
          contentType: upload.mimeType || file.type || 'image/jpeg',
          cacheControl: '3600',
        });
      if (uploadError) throw new Error(uploadError.message || 'No se pudo subir la foto.');

      const completeResponse = await fetch(`/api/maintenance/work-orders/${current.work_order_id}/evidence`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete_upload',
          evidenceId: upload.evidenceId,
          storagePath: upload.storagePath,
          fileName: upload.fileName || file.name || 'foto.jpg',
          mimeType: upload.mimeType || file.type || '',
          sizeBytes: upload.sizeBytes || file.size,
        }),
      });
      const completed = await completeResponse.json().catch(() => null);
      if (!completeResponse.ok) throw new Error(completed?.error || 'La foto subió, pero no se pudo registrar.');

      }
      await Promise.all([mutateEvidence(), mutate()]);
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'No se pudo guardar la evidencia.');
    } finally {
      setUploadingEvidence(false);
    }
  }

  async function declareMaterials(requiresMaterials: boolean) {
    if (!current) return;
    setSaving(true);
    setActionError(null);
    try {
      const response = await fetch(`/api/maintenance/work-orders/${current.work_order_id}/materials`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ requiresMaterials }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.error || t.errors.updateFailed);
      await mutate();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : t.errors.updateFailed);
    } finally {
      setSaving(false);
    }
  }

  async function performNextAction() {
    if (!current) return;

    if (current.next_action === 'complete_standard_plan_step') {
      if (!current.next_plan_step_id) return setActionError(t.errors.notFoundStep);
      return request(`/api/maintenance/work-orders/${current.work_order_id}/standard-plan`, {
        stepId: current.next_plan_step_id,
        observation: stepObservation.trim() || null,
      });
    }

    if (current.next_action === 'record_root_cause') {
      const value = textValue.trim();
      if (!value) return setActionError(t.errors.rootCauseRequired);
      return patchCurrent({ root_cause: value });
    }

    if (current.next_action === 'record_preventive_actions') {
      const value = textValue.trim();
      if (!value) return setActionError(t.errors.preventiveRequired);
      return patchCurrent({ preventive_actions: value });
    }

    if (current.next_action === 'record_actual_hours') {
      const hours = Number(hoursValue);
      if (!Number.isFinite(hours) || hours <= 0) return setActionError(t.errors.hoursInvalid);
      return patchCurrent({ actual_duration_hours: hours });
    }

    if (current.next_action === 'record_runtime_evidence') {
      const body: Record<string, unknown> = { workOrderId: current.work_order_id, mode: meterMode };
      if (meterMode === 'meter_reading') {
        const meterHours = Number(meterValue);
        if (!Number.isFinite(meterHours) || meterHours < 0) return setActionError(t.errors.meterInvalid);
        if (!meterRecordedAt) return setActionError(t.errors.meterDateRequired);
        body.meterHours = meterHours;
        body.recordedAt = new Date(meterRecordedAt).toISOString();
      } else {
        const reason = meterReason.trim();
        if (!reason) return setActionError(t.errors.meterReasonRequired);
        body.unavailableReason = reason;
      }
      return request('/api/maintenance/work-order-runtime-evidence', body);
    }

    if (current.next_action === 'close_work_order') {
      if (evidenceCount < 1) return setActionError('Agrega al menos una foto antes de cerrar.');
      return request(`/api/maintenance/work-orders/${current.work_order_id}/close`, {
        actual_duration_hours: Number(current.actual_duration_hours || 0),
        root_cause: current.root_cause,
        preventive_actions: current.preventive_actions,
      });
    }
  }

  if (isLoading) {
    return <Card className="shadow-none"><CardContent className="p-6 text-sm text-muted-foreground">{t.loading}</CardContent></Card>;
  }

  if (error) {
    return <Card className="border-destructive/30 bg-destructive/5 shadow-none"><CardContent className="p-6 text-sm text-destructive">{t.loadError}</CardContent></Card>;
  }

  if (!current) {
    return (
      <Card className="shadow-none">
        <CardContent className="flex items-start gap-3 p-6">
          <CheckCircle2 className="mt-0.5 h-5 w-5" />
          <div>
            <p className="font-medium">{t.empty.title}</p>
            <p className="mt-1 text-sm text-muted-foreground">{t.empty.description}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const actionKey = ACTION_KEYS[current.next_action];
  const copy = actionKey
    ? { title: t.actionTitles[actionKey], description: t.actionDescriptions[actionKey] }
    : t.fallbackAction;
  const inline = [
    'declare_materials',
    'complete_standard_plan_step',
    'record_root_cause',
    'record_preventive_actions',
    'record_actual_hours',
    'record_runtime_evidence',
    'close_work_order',
  ].includes(current.next_action);

  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{queue.length.toLocaleString(numberLocale)} OT{queue.length === 1 ? '' : 's'} pendiente{queue.length === 1 ? '' : 's'}</p>
        <div className="flex items-center gap-2">
          {Number(current.standard_plan_steps_total || 0) > 0 ? (
            <Badge variant="secondary">
              {fill(t.planBadgeTemplate, { completed: current.standard_plan_steps_completed || 0, total: current.standard_plan_steps_total || 0 })}
            </Badge>
          ) : null}
          <Badge variant="outline">{formatWorkOrderNumber(current.work_order_number, locale)}</Badge>
        </div>
      </div>

      <Card className="shadow-none">
        <CardContent className="space-y-6 p-5 sm:p-6">
          <div>
            <p className="text-xs text-muted-foreground">Equipo</p>
            <p className="mt-1 font-medium">{formatAssetIdentity(current.asset?.name, current.asset?.asset_code) || t.noAsset}</p>
          </div>

          <div>
            <p className="text-xs text-muted-foreground">Trabajo</p>
            <p className="mt-1 font-medium">{current.title || t.untitled}</p>
          </div>

          <div className="border-t pt-5">
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Siguiente paso</p>
            <h2 className="mt-2 text-xl font-semibold">{copy.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{copy.description}</p>
          </div>

          {current.next_action === 'declare_materials' ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">Confirma si esta intervención utilizó o utilizará repuestos/materiales. La respuesta queda auditada.</p>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => void declareMaterials(true)} disabled={saving}>Sí, usa materiales</Button>
                <Button variant="outline" onClick={() => void declareMaterials(false)} disabled={saving}>No usa materiales</Button>
              </div>
            </div>
          ) : null}

          {current.next_action === 'complete_standard_plan_step' ? (
            <div className="space-y-3">
              <p className="font-medium">{current.next_plan_step_title}</p>
              {current.next_plan_step_instructions ? <p className="text-sm text-muted-foreground">{current.next_plan_step_instructions}</p> : null}
              <textarea
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                rows={2}
                value={stepObservation}
                onChange={(event) => setStepObservation(event.target.value)}
                placeholder={t.step.observationPlaceholder}
              />
            </div>
          ) : null}

          {current.next_action === 'record_root_cause' || current.next_action === 'record_preventive_actions' ? (
            <textarea
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              rows={3}
              value={textValue}
              onChange={(event) => setTextValue(event.target.value)}
              placeholder={current.next_action === 'record_root_cause' ? t.placeholders.rootCause : t.placeholders.preventiveActions}
            />
          ) : null}

          {current.next_action === 'record_actual_hours' ? (
            <Input
              type="number"
              min="0.01"
              step="0.25"
              value={hoursValue}
              onChange={(event) => setHoursValue(event.target.value)}
              placeholder={t.placeholders.actualHours}
            />
          ) : null}

          {current.next_action === 'record_runtime_evidence' ? (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant={meterMode === 'meter_reading' ? 'default' : 'outline'} onClick={() => setMeterMode('meter_reading')}>
                  {t.meter.registerReading}
                </Button>
                <Button size="sm" variant={meterMode === 'not_available' ? 'default' : 'outline'} onClick={() => setMeterMode('not_available')}>
                  {t.meter.notAvailable}
                </Button>
              </div>
              {meterMode === 'meter_reading' ? (
                <div className="grid gap-3 sm:grid-cols-2">
                  <Input type="number" min="0" step="0.1" value={meterValue} onChange={(event) => setMeterValue(event.target.value)} placeholder={t.meter.readingPlaceholder} />
                  <Input type="datetime-local" value={meterRecordedAt} onChange={(event) => setMeterRecordedAt(event.target.value)} />
                </div>
              ) : (
                <textarea
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  rows={2}
                  value={meterReason}
                  onChange={(event) => setMeterReason(event.target.value)}
                  placeholder={t.meter.reasonPlaceholder}
                />
              )}
            </div>
          ) : null}

          {current.next_action === 'close_work_order' ? (
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="font-medium">Evidencia</p>
                  <p className="text-sm text-muted-foreground">
                    {evidenceCount > 0 ? `${evidenceCount} foto${evidenceCount === 1 ? '' : 's'}` : 'Agrega una foto para cerrar.'}
                  </p>
                </div>
                <label className="inline-flex h-10 cursor-pointer items-center rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-accent">
                  <Camera className="mr-2 h-4 w-4" />
                  {uploadingEvidence ? 'Subiendo...' : 'Agregar fotos'}
                  <input
                    className="sr-only"
                    type="file"
                    multiple
                    accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                    capture="environment"
                    disabled={uploadingEvidence}
                    onChange={(event) => void uploadEvidence(event.target.files)}
                  />
                </label>
              </div>

              {evidenceCount > 0 ? (
                <div className="flex gap-2 overflow-x-auto pb-1">
                  {evidence.map((photo) => (
                    <a
                      key={photo.id}
                      href={photo.signed_url || '#'}
                      target="_blank"
                      rel="noreferrer"
                      className="w-20 shrink-0"
                      title={photo.file_name}
                    >
                      <div className="h-16 overflow-hidden rounded-md border bg-muted">
                      {photo.signed_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={photo.signed_url} alt={photo.file_name || 'Evidencia'} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center">
                          <Camera className="h-4 w-4 text-muted-foreground" />
                        </div>
                      )}
                      </div>
                    </a>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {actionError ? (
            <div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
              <AlertCircle className="mr-2 inline h-4 w-4" />
              {actionError}
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row">
            {inline && data?.canEdit && current.next_action !== 'declare_materials' ? (
              <Button className="sm:min-w-48" onClick={() => void performNextAction()} disabled={saving}>
                {saving
                  ? t.actions.saving
                  : current.next_action === 'close_work_order'
                    ? 'Cerrar OT'
                    : current.next_action === 'complete_standard_plan_step'
                      ? t.actions.markStepDone
                      : t.actions.saveContinue}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : null}

            {!inline ? (
              <Button asChild>
                <Link href={`/dashboard/mantenimiento/ordenes-trabajo/${current.work_order_id}`}>
                  {t.actions.resolveInSheet}
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : null}

            <Button asChild variant="ghost">
              <Link href={`/dashboard/mantenimiento/ordenes-trabajo/${current.work_order_id}`}>Ver OT</Link>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
