export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { requireMeterAssetAssignment } from '@/lib/maintenance/meter-asset-access';
import { checkMeterConsistency } from '@/lib/maintenance/meter-consistency';

const BUCKET = 'maintenance-work-order-evidence';
const MAX_BYTES = 10 * 1024 * 1024;
const MIME_EXTENSIONS: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
  'image/heic': 'heic', 'image/heif': 'heif',
};

// One mechanic action: record the observed value, optionally attaching a camera photo.
// Never infer a meter value from a photograph; a human must confirm the number.
export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  let storedPath: string | null = null;
  try {
    const form = await request.formData();
    const canonicalAssetId = String(form.get('canonicalAssetId') || '').trim();
    const rawHours = String(form.get('meterHours') || '').trim();
    const meterHours = Number(rawHours);
    const recordedAt = new Date().toISOString();
    if (!canonicalAssetId || !rawHours || !Number.isFinite(meterHours) || meterHours < 0) {
      return NextResponse.json({ error: 'Selecciona un equipo e ingresa una lectura válida.' }, { status: 400 });
    }

    const { data: asset, error: assetError } = await context.supabase
      .from('maintenance_canonical_assets_v1').select('id')
      .eq('organization_id', context.organizationId).eq('id', canonicalAssetId).maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return NextResponse.json({ error: 'Equipo no disponible para esta organización.' }, { status: 404 });
    const denied = await requireMeterAssetAssignment(request, context, canonicalAssetId);
    if (denied) return denied;

    const submissionId = String(form.get('submissionId') || '').trim();
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(submissionId)) {
      return NextResponse.json({ error: 'Identificador de captura inválido.' }, { status: 400 });
    }
    const { data: existing } = await context.supabase.from('asset_runtime_readings')
      .select('id,meter_hours,recorded_at,source_reference')
      .eq('organization_id', context.organizationId).eq('canonical_asset_id', canonicalAssetId)
      .eq('id', submissionId).eq('recorded_by', context.userId)
      .maybeSingle();
    if (existing) return NextResponse.json({ reading: existing, alreadySaved: true });

    const photo = form.get('photo');
    if (photo !== null) {
      if (!(photo instanceof File) || !MIME_EXTENSIONS[photo.type] || photo.size <= 0 || photo.size > MAX_BYTES) {
        return NextResponse.json({ error: 'Usa una foto JPG, PNG, WEBP o HEIC de hasta 10 MB.' }, { status: 400 });
      }
      storedPath = `${context.organizationId}/meter-readings/${canonicalAssetId}/${crypto.randomUUID()}.${MIME_EXTENSIONS[photo.type]}`;
      const { error: uploadError } = await context.supabase.storage.from(BUCKET)
        .upload(storedPath, photo, { contentType: photo.type, upsert: false });
      if (uploadError) throw uploadError;
    }

    const { data: latest, error: latestError } = await context.supabase.from('asset_runtime_readings')
      .select('meter_hours,recorded_at').eq('organization_id', context.organizationId)
      .eq('canonical_asset_id', canonicalAssetId).order('recorded_at', { ascending: false })
      .limit(1).maybeSingle();
    if (latestError) throw latestError;

    const consistency = checkMeterConsistency(latest, { meter_hours: meterHours, recorded_at: recordedAt });
    if (consistency.status === 'review') {
      // Preserve disputed readings and their evidence for supervisors, never as canonical runtime.
      const { error: queueError } = await context.supabase.from('maintenance_meter_review_queue').insert({
        organization_id: context.organizationId,
        canonical_asset_id: canonicalAssetId,
        submitted_hours: meterHours,
        previous_hours: latest?.meter_hours ?? null,
        previous_recorded_at: latest?.recorded_at ?? null,
        attempted_at: recordedAt,
        attempted_by: context.userId,
        reason: consistency.reason,
        evidence_path: storedPath,
      });
      if (queueError) throw queueError;
      storedPath = null; // Review record and its evidence are durable.
      return NextResponse.json({
        error: 'Lectura incoherente con el horómetro anterior. Solicita revisión de Ariel o Mauricio.',
        reason: consistency.reason, previousMeterHours: latest?.meter_hours ?? null,
        deltaHours: consistency.deltaHours, elapsedHours: consistency.elapsedHours,
        requiresSupervisorReview: true,
      }, { status: 409 });
    }

    const { data: reading, error } = await context.supabase.from('asset_runtime_readings')
      .insert({
        id: submissionId,
        organization_id: context.organizationId,
        canonical_asset_id: canonicalAssetId,
        meter_hours: meterHours,
        recorded_at: recordedAt,
        source_type: 'manual',
        source_reference: storedPath ? `storage:${BUCKET}/${storedPath}` : 'mechanic:manual',
        notes: `capture:${submissionId}`,
        recorded_by: context.userId,
      }).select('id,meter_hours,recorded_at,source_reference').single();
    if (error?.code === '23505') {
      if (storedPath) await context.supabase.storage.from(BUCKET).remove([storedPath]);
      storedPath = null;
      const { data: duplicate } = await context.supabase.from('asset_runtime_readings')
        .select('id,meter_hours,recorded_at,source_reference').eq('id', submissionId)
        .eq('organization_id', context.organizationId).eq('canonical_asset_id', canonicalAssetId)
        .eq('recorded_by', context.userId).maybeSingle();
      if (duplicate) return NextResponse.json({ reading: duplicate, alreadySaved: true });
    }
    if (error) throw error;
    storedPath = null; // Reading is durable. Never delete its attached evidence on a later alert-query error.
    // The canonical hour-plan projection recalculates from the newly recorded reading.
    // Surface its alerts immediately; do not generate a work order or rewrite plan history.
    const { data: hourPlans, error: hourPlanError } = await context.supabase
      .from('preventive_maintenance_hour_status_v1')
      .select('schedule_id,task_name,hour_status,remaining_hours,alert_due,meter_basis_conflict')
      .eq('organization_id', context.organizationId)
      .eq('canonical_asset_id', canonicalAssetId)
      .eq('enabled', true);
    const preventiveAlerts = hourPlanError ? [] : (hourPlans || [])
      .filter((plan) => plan.alert_due && !plan.meter_basis_conflict)
      .map((plan) => ({
        scheduleId: plan.schedule_id,
        taskName: plan.task_name,
        status: plan.hour_status,
        remainingHours: plan.remaining_hours,
      }));
    return NextResponse.json({
      reading, hasPhoto: Boolean(storedPath),
      resetDetected: Boolean(latest && meterHours < Number(latest.meter_hours)),
      preventiveAlerts,
      alertsEvaluation: hourPlanError ? 'unavailable' : 'evaluated',
    }, { status: 201 });
  } catch (error) {
    if (storedPath) await context.supabase.storage.from(BUCKET).remove([storedPath]).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo guardar la lectura.' }, { status: 500 });
  }
}
