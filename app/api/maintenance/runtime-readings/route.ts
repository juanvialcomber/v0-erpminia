export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const SOURCE_TYPES = new Set(['manual', 'import', 'telemetry']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [summaryResult, readingsResult, assetsResult, hourStatusResult] = await Promise.all([
      context.supabase
        .from('maintenance_runtime_cost_intelligence_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('reading_count', { ascending: false })
        .limit(200),
      context.supabase
        .from('asset_runtime_intervals_v1')
        .select('id,canonical_asset_id,meter_hours,recorded_at,source_type,source_reference,notes,previous_meter_hours,operating_hours_delta,reset_detected')
        .eq('organization_id', context.organizationId)
        .order('recorded_at', { ascending: false })
        .limit(200),
      context.supabase
        .from('maintenance_canonical_assets_v1')
        .select('id,asset_code,name')
        .eq('organization_id', context.organizationId)
        .order('asset_code', { ascending: true })
        .limit(5000),
      context.supabase
        .from('preventive_maintenance_hour_status_v1')
        .select('schedule_id,canonical_asset_id,asset_code,asset_name,task_name,last_executed_meter,source_meter_snapshot,latest_runtime_meter,effective_current_meter,meter_evidence_source,hour_status,remaining_hours,alert_due,source_reference')
        .eq('organization_id', context.organizationId)
        .order('remaining_hours', { ascending: true, nullsFirst: false })
        .limit(500),
    ]);

    const error = summaryResult.error || readingsResult.error || assetsResult.error || hourStatusResult.error;
    if (error) throw error;

    const reconciliationByAsset = new Map<string, {
      canonical_asset_id: string;
      asset_code: string | null;
      asset_name: string | null;
      source_meter_snapshot: number | null;
      last_executed_meter: number | null;
      latest_runtime_meter: number | null;
      source_reference: string | null;
      affected_tasks: string[];
      reason: 'meter_below_last_execution' | 'no_runtime_reading';
    }>();

    for (const row of hourStatusResult.data || []) {
      const current = row.effective_current_meter == null ? null : Number(row.effective_current_meter);
      const lastExecuted = row.last_executed_meter == null ? null : Number(row.last_executed_meter);
      const hasRuntime = row.latest_runtime_meter != null;
      const meterBelowLastExecution = current != null && lastExecuted != null && current < lastExecuted;
      const noRuntimeReading = !hasRuntime && row.meter_evidence_source === 'schedule_snapshot';
      if (!meterBelowLastExecution && !noRuntimeReading) continue;

      const existing = reconciliationByAsset.get(row.canonical_asset_id);
      if (existing) {
        if (!existing.affected_tasks.includes(row.task_name)) existing.affected_tasks.push(row.task_name);
        if (meterBelowLastExecution) existing.reason = 'meter_below_last_execution';
        continue;
      }

      reconciliationByAsset.set(row.canonical_asset_id, {
        canonical_asset_id: row.canonical_asset_id,
        asset_code: row.asset_code || null,
        asset_name: row.asset_name || null,
        source_meter_snapshot: row.source_meter_snapshot == null ? null : Number(row.source_meter_snapshot),
        last_executed_meter: row.last_executed_meter == null ? null : Number(row.last_executed_meter),
        latest_runtime_meter: row.latest_runtime_meter == null ? null : Number(row.latest_runtime_meter),
        source_reference: row.source_reference || null,
        affected_tasks: [row.task_name],
        reason: meterBelowLastExecution ? 'meter_below_last_execution' : 'no_runtime_reading',
      });
    }

    const reconciliationQueue = Array.from(reconciliationByAsset.values()).sort((a, b) => {
      if (a.reason !== b.reason) return a.reason === 'meter_below_last_execution' ? -1 : 1;
      return String(a.asset_code || a.asset_name || '').localeCompare(String(b.asset_code || b.asset_name || ''));
    });

    return NextResponse.json({
      assets: assetsResult.data || [],
      runtime: summaryResult.data || [],
      readings: readingsResult.data || [],
      reconciliationQueue,
      canEdit: access.canWrite,
      source: 'asset_runtime_readings',
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los horómetros' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  if (!access.canWrite) return NextResponse.json({ error: 'Sin permiso de edición' }, { status: 403 });
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json();
    const canonicalAssetId = String(body?.canonicalAssetId || '').trim();
    const meterHours = Number(body?.meterHours);
    const recordedAt = String(body?.recordedAt || '').trim();
    const sourceType = String(body?.sourceType || 'manual').trim();
    const sourceReference = String(body?.sourceReference || '').trim() || null;
    const notes = String(body?.notes || '').trim() || null;

    if (!canonicalAssetId || !Number.isFinite(meterHours) || meterHours < 0 || !recordedAt || Number.isNaN(new Date(recordedAt).getTime()) || !SOURCE_TYPES.has(sourceType)) {
      return NextResponse.json({ error: 'Lectura de horómetro inválida' }, { status: 400 });
    }

    const { data: asset, error: assetError } = await context.supabase
      .from('maintenance_canonical_assets_v1')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('id', canonicalAssetId)
      .maybeSingle();
    if (assetError) throw assetError;
    if (!asset) return NextResponse.json({ error: 'Activo no pertenece a la organización' }, { status: 404 });

    const { data: latest, error: latestError } = await context.supabase
      .from('asset_runtime_readings')
      .select('meter_hours,recorded_at')
      .eq('organization_id', context.organizationId)
      .eq('canonical_asset_id', canonicalAssetId)
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (latestError) throw latestError;

    const { data, error } = await context.supabase
      .from('asset_runtime_readings')
      .insert({
        organization_id: context.organizationId,
        canonical_asset_id: canonicalAssetId,
        meter_hours: meterHours,
        recorded_at: new Date(recordedAt).toISOString(),
        source_type: sourceType,
        source_reference: sourceReference,
        notes,
        recorded_by: context.userId,
      })
      .select('id,canonical_asset_id,meter_hours,recorded_at,source_type,source_reference,notes')
      .single();
    if (error) throw error;

    return NextResponse.json({
      reading: data,
      resetDetected: Boolean(latest && meterHours < Number(latest.meter_hours)),
      previousMeterHours: latest?.meter_hours ?? null,
    }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar el horómetro' }, { status: 500 });
  }
}
