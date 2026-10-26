export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type AssetRow = {
  id: string;
  asset_code?: string | null;
  name?: string | null;
  criticality?: string | null;
  operational_status?: string | null;
  acquisition_date?: string | null;
  acquisition_cost?: number | string | null;
  expected_lifespan_years?: number | string | null;
};

type OperationalRow = {
  canonical_asset_id: string;
  recognized_cost_event_count?: number | string | null;
  recognized_cost_clp_lifetime?: number | string | null;
  recognized_cost_clp_12m?: number | string | null;
  work_order_count?: number | string | null;
  open_work_order_count?: number | string | null;
  recorded_downtime_hours?: number | string | null;
  availability_pct?: number | string | null;
  criticality?: string | null;
  operational_status?: string | null;
};

type RuntimeRow = {
  canonical_asset_id: string;
  reading_count?: number | string | null;
  latest_meter_hours?: number | string | null;
  observed_operating_hours?: number | string | null;
  usable_for_rate_metrics?: boolean | null;
};

function numeric(value: unknown) {
  if (value == null || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function criticalityLevel(value: unknown) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['critical', 'critica', 'crítica'].includes(normalized)) return 4;
  if (['high', 'alta', 'alto'].includes(normalized)) return 3;
  if (['medium', 'media', 'medio'].includes(normalized)) return 2;
  if (['low', 'baja', 'bajo'].includes(normalized)) return 1;
  return 0;
}

function criticalityLabel(value: unknown) {
  const level = criticalityLevel(value);
  if (level === 4) return 'Crítica';
  if (level === 3) return 'Alta';
  if (level === 2) return 'Media';
  if (level === 1) return 'Baja';
  return 'Sin definir';
}

function buildDecision(params: {
  criticality: unknown;
  openWorkOrders: number;
  downtimeHours: number;
  hasCoreEconomics: boolean;
  hasRuntime: boolean;
  hasMaintenanceEvidence: boolean;
}) {
  const level = criticalityLevel(params.criticality);

  if (level >= 3 && (params.openWorkOrders > 0 || params.downtimeHours > 0)) {
    return {
      key: 'maintenance_attention',
      label: 'Revisar mantenimiento',
      reason: params.openWorkOrders > 0
        ? `${params.openWorkOrders} OT abierta(s) en activo de criticidad ${criticalityLabel(params.criticality).toLowerCase()}`
        : `${params.downtimeHours.toLocaleString('es-CL')} h de detención registradas en activo de criticidad ${criticalityLabel(params.criticality).toLowerCase()}`,
      rank: 4,
    };
  }

  if (!params.hasCoreEconomics) {
    return {
      key: 'complete_economics',
      label: 'Completar economía',
      reason: 'Seguro canónico vinculado, pero falta costo/fecha de adquisición en el activo canónico',
      rank: 3,
    };
  }

  if (params.hasMaintenanceEvidence && !params.hasRuntime) {
    return {
      key: 'complete_runtime',
      label: 'Completar uso',
      reason: 'Existe historia de mantenimiento, pero falta una secuencia de uso u horómetro utilizable',
      rank: 2,
    };
  }

  return {
    key: 'monitor',
    label: 'Monitorear',
    reason: 'La evidencia financiera y operacional disponible no activa una excepción determinística',
    rank: 1,
  };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data: workbookSources, error: sourceError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_kind,source_cutoff_date,review_status,metadata,updated_at,created_at')
    .eq('organization_id', context.organizationId)
    .in('source_kind', ['insured_asset_inventory', 'fixed_asset_depreciation_model'])
    .order('created_at', { ascending: false });

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });

  const insuranceSource = (workbookSources || []).find((row: any) => row.source_kind === 'insured_asset_inventory') || null;
  const depreciationSource = (workbookSources || []).find((row: any) => row.source_kind === 'fixed_asset_depreciation_model') || null;
  const source = insuranceSource || depreciationSource;

  if (!source) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: null,
      sources: { insurance: null, depreciation: null },
      summary: {
        linkedAssets: 0,
        withCriticality: 0,
        withMaintenanceEvidence: 0,
        withRuntimeEvidence: 0,
        withCoreEconomics: 0,
        withBookValue: 0,
        depreciationConflicts: 0,
        maintenanceAttention: 0,
        economicsToComplete: 0,
      },
      queue: [],
    });
  }

  const [insuredResult, depreciationIdentityResult] = await Promise.all([
    insuranceSource
      ? context.supabase
          .from('motil_finance_asset_stage')
          .select('id,canonical_asset_id,insured_uf,equipment_type,brand,model,model_year,serial_number,license_plate,identity_status,identity_basis,source_sheet,source_row')
          .eq('organization_id', context.organizationId)
          .eq('import_id', insuranceSource.id)
          .not('canonical_asset_id', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    depreciationSource
      ? context.supabase
          .from('motil_finance_asset_stage')
          .select('id,canonical_asset_id')
          .eq('organization_id', context.organizationId)
          .eq('import_id', depreciationSource.id)
          .not('canonical_asset_id', 'is', null)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const stageError = insuredResult.error || depreciationIdentityResult.error;
  if (stageError) return NextResponse.json({ error: stageError.message }, { status: 500 });

  const uniqueStageByAsset = new Map<string, any>();
  for (const row of insuredResult.data || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId || uniqueStageByAsset.has(assetId)) continue;
    uniqueStageByAsset.set(assetId, row);
  }

  const assetIds = Array.from(new Set([
    ...uniqueStageByAsset.keys(),
    ...(depreciationIdentityResult.data || [])
      .map((row: any) => String(row.canonical_asset_id || ''))
      .filter(Boolean),
  ]));

  if (assetIds.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source,
      sources: { insurance: insuranceSource, depreciation: depreciationSource },
      summary: {
        linkedAssets: 0,
        withCriticality: 0,
        withMaintenanceEvidence: 0,
        withRuntimeEvidence: 0,
        withCoreEconomics: 0,
        withBookValue: 0,
        depreciationConflicts: 0,
        maintenanceAttention: 0,
        economicsToComplete: 0,
      },
      queue: [],
    });
  }

  const [assetsResult, operationalResult, runtimeResult, depreciationResult, planningResult, meterResult] = await Promise.all([
    context.supabase
      .from('canonical_assets_current')
      .select('id,asset_code,name,criticality,operational_status,acquisition_date,acquisition_cost,expected_lifespan_years')
      .eq('organization_id', context.organizationId)
      .in('id', assetIds),
    context.supabase
      .from('asset_operational_state_v1')
      .select('canonical_asset_id,recognized_cost_event_count,recognized_cost_clp_lifetime,recognized_cost_clp_12m,work_order_count,open_work_order_count,recorded_downtime_hours,availability_pct,criticality,operational_status')
      .eq('organization_id', context.organizationId)
      .in('canonical_asset_id', assetIds),
    context.supabase
      .from('asset_runtime_summary_v1')
      .select('canonical_asset_id,reading_count,latest_meter_hours,observed_operating_hours,usable_for_rate_metrics')
      .eq('organization_id', context.organizationId)
      .in('canonical_asset_id', assetIds),
    depreciationSource
      ? context.supabase
          .from('motil_finance_asset_stage')
          .select('canonical_asset_id,net_book_value,updated_asset,total_accum_depr,depreciation_current,remaining_life_months,cost_center_raw,source_sheet,source_row,source_payload')
          .eq('organization_id', context.organizationId)
          .eq('import_id', depreciationSource.id)
          .in('canonical_asset_id', assetIds)
          .not('net_book_value', 'is', null)
      : Promise.resolve({ data: [], error: null }),
    context.supabase
      .from('planning_maintenance_source_rows')
      .select('canonical_asset_id,criticality_raw,current_reading,current_reading_at,meter_unit,updated_at')
      .eq('organization_id', context.organizationId)
      .in('canonical_asset_id', assetIds)
      .order('updated_at', { ascending: false }),
    context.supabase
      .from('planning_asset_meter_readings')
      .select('canonical_asset_id,recorded_at,meter_value,meter_unit')
      .eq('organization_id', context.organizationId)
      .in('canonical_asset_id', assetIds)
      .order('recorded_at', { ascending: true }),
  ]);

  const queryError =
    assetsResult.error ||
    operationalResult.error ||
    runtimeResult.error ||
    depreciationResult.error ||
    planningResult.error ||
    meterResult.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const assetsById = new Map<string, AssetRow>((assetsResult.data || []).map((row: any) => [row.id, row]));
  const operationalById = new Map<string, OperationalRow>((operationalResult.data || []).map((row: any) => [row.canonical_asset_id, row]));
  const runtimeById = new Map<string, RuntimeRow>((runtimeResult.data || []).map((row: any) => [row.canonical_asset_id, row]));

  const planningByAsset = new Map<string, any[]>();
  for (const row of planningResult.data || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const rows = planningByAsset.get(assetId) || [];
    rows.push(row);
    planningByAsset.set(assetId, rows);
  }

  const meterByAsset = new Map<string, any[]>();
  for (const row of meterResult.data || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const rows = meterByAsset.get(assetId) || [];
    const signature = [assetId, row.recorded_at || '', row.meter_value ?? '', row.meter_unit || ''].join('|');
    if (!rows.some((item) => item.signature === signature)) {
      rows.push({ ...row, signature });
      meterByAsset.set(assetId, rows);
    }
  }

  const depreciationByAsset = new Map<string, any[]>();
  for (const row of depreciationResult.data || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const rows = depreciationByAsset.get(assetId) || [];
    rows.push(row);
    depreciationByAsset.set(assetId, rows);
  }

  const queue = assetIds.map((assetId) => {
    const stage = uniqueStageByAsset.get(assetId);
    const asset = assetsById.get(assetId) || ({ id: assetId } as AssetRow);
    const operational = operationalById.get(assetId);
    const runtime = runtimeById.get(assetId);
    const planningRows = planningByAsset.get(assetId) || [];
    const meterRows = (meterByAsset.get(assetId) || []).sort(
      (a, b) => new Date(a.recorded_at || 0).getTime() - new Date(b.recorded_at || 0).getTime(),
    );
    const depreciationRows = depreciationByAsset.get(assetId) || [];
    const depreciation = depreciationRows.length === 1 ? depreciationRows[0] : null;
    const depreciationConflictCount = depreciationRows.length > 1 ? depreciationRows.length : 0;

    const planningCriticalityLevels = Array.from(new Set(
      planningRows
        .map((row) => criticalityLevel(row.criticality_raw))
        .filter((level) => level > 0),
    ));
    const planningCriticality =
      planningCriticalityLevels.length === 1
        ? criticalityLabel(
            planningRows.find((row) => criticalityLevel(row.criticality_raw) === planningCriticalityLevels[0])?.criticality_raw,
          )
        : null;
    const criticality = asset.criticality || operational?.criticality || planningCriticality || null;
    const openWorkOrders = numeric(operational?.open_work_order_count) || 0;
    const workOrders = numeric(operational?.work_order_count) || 0;
    const downtimeHours = numeric(operational?.recorded_downtime_hours) || 0;
    const recognizedCostLifetime = numeric(operational?.recognized_cost_clp_lifetime);
    const recognizedCost12m = numeric(operational?.recognized_cost_clp_12m);
    const runtimeReadings = Math.max(numeric(runtime?.reading_count) || 0, meterRows.length);
    const meterUnits = Array.from(new Set(meterRows.map((row) => String(row.meter_unit || '').trim().toLowerCase()).filter(Boolean)));
    const meterValues = meterRows
      .map((row) => numeric(row.meter_value))
      .filter((value): value is number => value != null);
    const distinctMeterValues = new Set(meterValues.map((value) => String(value))).size;
    const distinctMeterDates = new Set(
      meterRows.map((row) => String(row.recorded_at || '').slice(0, 10)).filter(Boolean),
    ).size;
    let meterDecreaseCount = 0;
    for (let index = 1; index < meterValues.length; index += 1) {
      if (meterValues[index - 1] - meterValues[index] > 1) meterDecreaseCount += 1;
    }
    const hasMeterEvidence = runtimeReadings > 0;
    const usablePlanningMeter =
      meterRows.length >= 2 &&
      distinctMeterValues >= 2 &&
      distinctMeterDates >= 2 &&
      meterUnits.length === 1 &&
      meterDecreaseCount === 0;
    const hasRuntime = Boolean(runtime?.usable_for_rate_metrics) || usablePlanningMeter;
    const latestPlanningMeter = meterRows.length > 0 ? meterRows[meterRows.length - 1] : null;
    const observedPlanningUsage =
      usablePlanningMeter && meterValues.length >= 2
        ? Math.max(meterValues[meterValues.length - 1] - meterValues[0], 0)
        : null;
    const hasMaintenanceEvidence = workOrders > 0 || (numeric(operational?.recognized_cost_event_count) || 0) > 0;
    const hasCoreEconomics = asset.acquisition_cost != null || asset.acquisition_date != null || depreciation?.net_book_value != null;

    const evidence = {
      insurance: Boolean(stage),
      bookValue: depreciation?.net_book_value != null,
      criticality: criticalityLevel(criticality) > 0,
      maintenance: hasMaintenanceEvidence,
      runtime: hasMeterEvidence,
    };
    const evidenceCount = Object.values(evidence).filter(Boolean).length;
    const decision = buildDecision({
      criticality,
      openWorkOrders,
      downtimeHours,
      hasCoreEconomics,
      hasRuntime,
      hasMaintenanceEvidence,
    });

    return {
      assetId,
      assetCode: asset.asset_code || null,
      assetName: asset.name || stage?.equipment_type || 'Activo sin nombre',
      criticality: criticalityLabel(criticality),
      operationalStatus: asset.operational_status || operational?.operational_status || null,
      insuredUf: numeric(stage?.insured_uf),
      insuranceIdentityBasis: stage?.identity_basis || null,
      insuranceSource: {
        sheet: stage?.source_sheet || null,
        row: stage?.source_row || null,
      },
      acquisitionDate: asset.acquisition_date || null,
      acquisitionCostClp: numeric(asset.acquisition_cost),
      expectedLifespanYears: numeric(asset.expected_lifespan_years),
      netBookValueClp: numeric(depreciation?.net_book_value),
      updatedAssetValueClp: numeric(depreciation?.updated_asset),
      accumulatedDepreciationClp: numeric(depreciation?.total_accum_depr),
      depreciationCurrentClp: numeric(depreciation?.depreciation_current),
      remainingLifeMonths: numeric(depreciation?.remaining_life_months),
      depreciationConflictCount,
      recognizedCostLifetimeClp: recognizedCostLifetime,
      recognizedCost12mClp: recognizedCost12m,
      workOrderCount: workOrders,
      openWorkOrderCount: openWorkOrders,
      downtimeHours,
      availabilityPct: numeric(operational?.availability_pct),
      runtimeReadings,
      meterUnit: meterUnits.length === 1 ? meterUnits[0] : null,
      latestMeterHours: numeric(runtime?.latest_meter_hours) ?? numeric(latestPlanningMeter?.meter_value),
      observedOperatingHours: numeric(runtime?.observed_operating_hours) ?? observedPlanningUsage,
      runtimeUsableForRates: Boolean(runtime?.usable_for_rate_metrics) || usablePlanningMeter,
      meterDecreaseCount,
      planningCriticalityConflict: planningCriticalityLevels.length > 1,
      evidence,
      evidenceCount,
      evidenceCoveragePct: evidenceCount * 20,
      decision,
      priority: {
        decisionRank: decision.rank,
        criticalityRank: criticalityLevel(criticality),
        openWorkOrders,
        downtimeHours,
        insuredUf: numeric(stage?.insured_uf) || 0,
      },
    };
  }).sort((a, b) =>
    b.priority.decisionRank - a.priority.decisionRank ||
    b.priority.criticalityRank - a.priority.criticalityRank ||
    b.priority.openWorkOrders - a.priority.openWorkOrders ||
    b.priority.downtimeHours - a.priority.downtimeHours ||
    b.priority.insuredUf - a.priority.insuredUf
  );

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source: {
      id: source.id,
      filename: source.filename,
      cutoffDate: source.source_cutoff_date,
      reviewStatus: source.review_status,
      canonical: Boolean((source.metadata as Record<string, unknown> | null)?.canonical),
      authority: (source.metadata as Record<string, unknown> | null)?.canonical_authority || null,
    },
    summary: {
      linkedAssets: queue.length,
      withCriticality: queue.filter((row) => row.evidence.criticality).length,
      withMaintenanceEvidence: queue.filter((row) => row.evidence.maintenance).length,
      withRuntimeEvidence: queue.filter((row) => row.evidence.runtime).length,
      withUsableRuntime: queue.filter((row) => row.runtimeUsableForRates).length,
      withCoreEconomics: queue.filter((row) => row.netBookValueClp != null || row.acquisitionCostClp != null || row.acquisitionDate != null).length,
      withBookValue: queue.filter((row) => row.netBookValueClp != null).length,
      depreciationConflicts: queue.filter((row) => row.depreciationConflictCount > 1).length,
      maintenanceAttention: queue.filter((row) => row.decision.key === 'maintenance_attention').length,
      economicsToComplete: queue.filter((row) => row.decision.key === 'complete_economics').length,
    },
    queue,
    semantics: {
      insurance: 'Valor asegurado en UF informado por la fuente canónica de Daniel. No se convierte a CLP ni se interpreta como valor libro.',
      maintenance: 'Costos y OT ya reconocidos por MOTIL para el activo canónico.',
      runtime: 'Lectura disponible y secuencia utilizable son estados distintos. Una secuencia sólo se habilita para tasas si tiene al menos dos fechas y valores distintos, una unidad consistente y sin disminuciones materiales.',
      decision: 'Reglas determinísticas de priorización. No son diagnóstico de falla ni recomendación automática de reemplazo.',
      replacement: 'MOTIL no recomienda reemplazo hasta enlazar valor libro/depreciación y contar con evidencia operacional suficiente.',
    },
  });
}
