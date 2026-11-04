export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type ArchivedScheduleRecord = {
  id?: string;
  organization_id?: string;
  asset_id?: string;
  canonical_asset_id?: string;
  task_name?: string;
  description?: string;
  frequency_days?: number | null;
  frequency_hours?: number | null;
  last_executed_date?: string | null;
  last_executed_meter?: number | null;
  meter_unit?: string | null;
  priority?: string | null;
  source_reference?: string | null;
  source_hash?: string | null;
  estimated_duration_hours?: number | null;
};

function asNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: archive, error: archiveError } = await context.supabase
    .from('motil_preventive_retired_archive_20261018')
    .select('original_id,archived_at,original_record')
    .eq('entity_type', 'schedule')
    .order('archived_at', { ascending: false })
    .limit(100);
  if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });

  const records = (archive || []).filter((row) => {
    const record = (row.original_record || {}) as ArchivedScheduleRecord;
    return record.organization_id === context.organizationId;
  });
  const assetIds = Array.from(new Set(records.map((row) => String((row.original_record as ArchivedScheduleRecord)?.canonical_asset_id || '')).filter(Boolean)));

  const { data: assets, error: assetError } = assetIds.length
    ? await context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name,asset_type,category,manufacturer,model,cost_center_code')
        .eq('organization_id', context.organizationId)
        .in('id', assetIds.slice(0, 100))
    : { data: [], error: null };
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });

  const { data: activeSchedules, error: activeError } = await context.supabase
    .from('preventive_maintenance_schedules')
    .select('id,canonical_asset_id,asset_id,task_name,frequency_hours,frequency_days')
    .eq('organization_id', context.organizationId)
    .limit(1000);
  if (activeError) return NextResponse.json({ error: activeError.message }, { status: 500 });

  const assetMap = new Map((assets || []).map((row) => [row.id, row]));
  const activeKeys = new Set((activeSchedules || []).map((row) => [
    row.canonical_asset_id || row.asset_id || '',
    String(row.task_name || '').trim().toLowerCase(),
    row.frequency_hours ?? '',
    row.frequency_days ?? '',
  ].join('|')));

  const candidates = records.map((row) => {
    const record = (row.original_record || {}) as ArchivedScheduleRecord;
    const assetId = String(record.canonical_asset_id || record.asset_id || '');
    const frequencyHours = asNumber(record.frequency_hours);
    const frequencyDays = asNumber(record.frequency_days);
    const key = [assetId, String(record.task_name || '').trim().toLowerCase(), frequencyHours ?? '', frequencyDays ?? ''].join('|');
    const asset = assetMap.get(assetId) || null;
    return {
      archiveId: row.original_id,
      archivedAt: row.archived_at,
      assetId,
      asset,
      taskName: record.task_name || null,
      description: record.description || null,
      frequencyHours,
      frequencyDays,
      lastExecutedDate: record.last_executed_date || null,
      lastExecutedMeter: asNumber(record.last_executed_meter),
      meterUnit: record.meter_unit || null,
      priority: record.priority || null,
      sourceReference: record.source_reference || null,
      sourceHash: record.source_hash || null,
      estimatedDurationHours: asNumber(record.estimated_duration_hours),
      assetExists: Boolean(asset),
      alreadyActive: activeKeys.has(key),
    };
  });

  return NextResponse.json({
    candidates,
    summary: {
      total: candidates.length,
      reviewable: candidates.filter((row) => row.assetExists && !row.alreadyActive).length,
      alreadyActive: candidates.filter((row) => row.alreadyActive).length,
      missingAsset: candidates.filter((row) => !row.assetExists).length,
    },
    canEdit: access.canWrite,
    source: 'motil_preventive_retired_archive_20261018',
    rules: {
      archiveIsHistorical: true,
      noAutoRestore: true,
      currentMeterNotCopied: true,
    },
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const archiveId = String(body?.archiveId || '').trim();
  if (!archiveId) return NextResponse.json({ error: 'Pauta histórica requerida.' }, { status: 400 });

  const { data: archived, error: archiveError } = await context.supabase
    .from('motil_preventive_retired_archive_20261018')
    .select('original_id,archived_at,original_record')
    .eq('entity_type', 'schedule')
    .eq('original_id', archiveId)
    .maybeSingle();
  if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
  if (!archived) return NextResponse.json({ error: 'Pauta histórica no encontrada.' }, { status: 404 });

  const record = (archived.original_record || {}) as ArchivedScheduleRecord;
  if (record.organization_id !== context.organizationId) {
    return NextResponse.json({ error: 'La pauta histórica no pertenece a la organización.' }, { status: 404 });
  }

  const canonicalAssetId = String(record.canonical_asset_id || record.asset_id || '').trim();
  if (!canonicalAssetId) return NextResponse.json({ error: 'La pauta histórica no tiene equipo canónico.' }, { status: 409 });

  const { data: asset, error: assetError } = await context.supabase
    .from('maintenance_canonical_assets_v1')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('id', canonicalAssetId)
    .maybeSingle();
  if (assetError) return NextResponse.json({ error: assetError.message }, { status: 500 });
  if (!asset) return NextResponse.json({ error: 'El equipo histórico ya no existe en el maestro canónico.' }, { status: 409 });

  const taskName = String(record.task_name || '').trim();
  if (!taskName) return NextResponse.json({ error: 'La pauta histórica no tiene nombre de tarea.' }, { status: 409 });
  const frequencyHours = asNumber(record.frequency_hours);
  const frequencyDays = asNumber(record.frequency_days);
  if ((frequencyHours === null || frequencyHours <= 0) && (frequencyDays === null || frequencyDays <= 0)) {
    return NextResponse.json({ error: 'La pauta histórica no tiene una frecuencia válida.' }, { status: 409 });
  }

  let duplicateQuery = context.supabase
    .from('preventive_maintenance_schedules')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('task_name', taskName)
    .or(`canonical_asset_id.eq.${canonicalAssetId},asset_id.eq.${canonicalAssetId}`);
  if (frequencyHours !== null) duplicateQuery = duplicateQuery.eq('frequency_hours', frequencyHours);
  else duplicateQuery = duplicateQuery.is('frequency_hours', null);
  if (frequencyDays !== null) duplicateQuery = duplicateQuery.eq('frequency_days', frequencyDays);
  else duplicateQuery = duplicateQuery.is('frequency_days', null);
  const { data: duplicate, error: duplicateError } = await duplicateQuery.limit(1).maybeSingle();
  if (duplicateError) return NextResponse.json({ error: duplicateError.message }, { status: 500 });
  if (duplicate) return NextResponse.json({ error: 'Esta pauta ya está activa.' }, { status: 409 });

  const lastExecutedMeter = asNumber(record.last_executed_meter);
  const derivedNextDueMeter = frequencyHours !== null && frequencyHours > 0 && lastExecutedMeter !== null
    ? lastExecutedMeter + frequencyHours
    : null;

  const sourceReference = [record.source_reference || 'Fuente histórica', 'Validada desde archivo MOTIL 2026-10-18'].join(' · ');
  const { data, error } = await context.supabase
    .from('preventive_maintenance_schedules')
    .insert({
      organization_id: context.organizationId,
      asset_id: canonicalAssetId,
      canonical_asset_id: canonicalAssetId,
      task_name: taskName,
      description: record.description || null,
      frequency_days: frequencyDays && frequencyDays > 0 ? Math.round(frequencyDays) : null,
      frequency_hours: frequencyHours && frequencyHours > 0 ? frequencyHours : null,
      last_executed_date: record.last_executed_date || null,
      next_scheduled_date: null,
      estimated_duration_hours: asNumber(record.estimated_duration_hours),
      priority: record.priority || 'medium',
      enabled: true,
      generated_work_order_id: null,
      last_generated_at: null,
      last_executed_meter: lastExecutedMeter,
      next_due_meter: derivedNextDueMeter,
      current_meter_snapshot: null,
      meter_unit: record.meter_unit || (frequencyHours ? 'horómetro' : null),
      source_reference: sourceReference,
      source_hash: record.source_hash || null,
    })
    .select('id,task_name,canonical_asset_id,frequency_hours,frequency_days,next_due_meter,source_reference')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({
    data,
    restoredFromArchiveId: archiveId,
    currentMeterCopied: false,
    note: 'La pauta fue restaurada con frecuencia/fuente histórica; el horómetro vigente se obtiene de la evidencia actual de MOTIL.',
  }, { status: 201 });
}
