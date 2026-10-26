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

  const { data: source, error: sourceError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_cutoff_date,review_status,metadata,updated_at')
    .eq('organization_id', context.organizationId)
    .eq('source_kind', 'insured_asset_inventory')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source: null,
      summary: {
        linkedAssets: 0,
        withCriticality: 0,
        withMaintenanceEvidence: 0,
        withRuntimeEvidence: 0,
        withCoreEconomics: 0,
      },
      queue: [],
    });
  }

  const { data: insuredRows, error: insuredError } = await context.supabase
    .from('motil_finance_asset_stage')
    .select('id,canonical_asset_id,insured_uf,equipment_type,brand,model,model_year,serial_number,license_plate,identity_status,identity_basis,source_sheet,source_row')
    .eq('organization_id', context.organizationId)
    .eq('import_id', source.id)
    .not('canonical_asset_id', 'is', null);

  if (insuredError) return NextResponse.json({ error: insuredError.message }, { status: 500 });

  const uniqueStageByAsset = new Map<string, any>();
  for (const row of insuredRows || []) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId || uniqueStageByAsset.has(assetId)) continue;
    uniqueStageByAsset.set(assetId, row);
  }
  const assetIds = [...uniqueStageByAsset.keys()];

  if (assetIds.length === 0) {
    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      source,
      summary: {
        linkedAssets: 0,
        withCriticality: 0,
        withMaintenanceEvidence: 0,
        withRuntimeEvidence: 0,
        withCoreEconomics: 0,
      },
      queue: [],
    });
  }

  const [assetsResult, operationalResult, runtimeResult] = await Promise.all([
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
  ]);

  const queryError = assetsResult.error || operationalResult.error || runtimeResult.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const assetsById = new Map<string, AssetRow>((assetsResult.data || []).map((row: any) => [row.id, row]));
  const operationalById = new Map<string, OperationalRow>((operationalResult.data || []).map((row: any) => [row.canonical_asset_id, row]));
  const runtimeById = new Map<string, RuntimeRow>((runtimeResult.data || []).map((row: any) => [row.canonical_asset_id, row]));

  const queue = assetIds.map((assetId) => {
    const stage = uniqueStageByAsset.get(assetId);
    const asset = assetsById.get(assetId) || ({ id: assetId } as AssetRow);
    const operational = operationalById.get(assetId);
    const runtime = runtimeById.get(assetId);

    const criticality = asset.criticality || operational?.criticality || null;
    const openWorkOrders = numeric(operational?.open_work_order_count) || 0;
    const workOrders = numeric(operational?.work_order_count) || 0;
    const downtimeHours = numeric(operational?.recorded_downtime_hours) || 0;
    const recognizedCostLifetime = numeric(operational?.recognized_cost_clp_lifetime);
    const recognizedCost12m = numeric(operational?.recognized_cost_clp_12m);
    const runtimeReadings = numeric(runtime?.reading_count) || 0;
    const hasRuntime = runtimeReadings > 0;
    const hasMaintenanceEvidence = workOrders > 0 || (numeric(operational?.recognized_cost_event_count) || 0) > 0;
    const hasCoreEconomics = asset.acquisition_cost != null || asset.acquisition_date != null;

    const evidence = {
      insurance: true,
      criticality: criticalityLevel(criticality) > 0,
      maintenance: hasMaintenanceEvidence,
      runtime: hasRuntime,
      acquisitionEconomics: hasCoreEconomics,
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
      recognizedCostLifetimeClp: recognizedCostLifetime,
      recognizedCost12mClp: recognizedCost12m,
      workOrderCount: workOrders,
      openWorkOrderCount: openWorkOrders,
      downtimeHours,
      availabilityPct: numeric(operational?.availability_pct),
      runtimeReadings,
      latestMeterHours: numeric(runtime?.latest_meter_hours),
      runtimeUsableForRates: Boolean(runtime?.usable_for_rate_metrics),
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
      withCoreEconomics: queue.filter((row) => row.evidence.acquisitionEconomics).length,
      maintenanceAttention: queue.filter((row) => row.decision.key === 'maintenance_attention').length,
      economicsToComplete: queue.filter((row) => row.decision.key === 'complete_economics').length,
    },
    queue,
    semantics: {
      insurance: 'Valor asegurado en UF informado por la fuente canónica de Daniel. No se convierte a CLP ni se interpreta como valor libro.',
      maintenance: 'Costos y OT ya reconocidos por MOTIL para el activo canónico.',
      decision: 'Reglas determinísticas de priorización. No son diagnóstico de falla ni recomendación automática de reemplazo.',
      replacement: 'MOTIL no recomienda reemplazo hasta enlazar valor libro/depreciación y contar con evidencia operacional suficiente.',
    },
  });
}
