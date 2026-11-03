export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

type RuntimeReading = {
  id: string;
  canonical_asset_id: string;
  meter_hours: number | string;
  recorded_at: string;
};

type FluidUsage = {
  id: string;
  canonical_asset_id: string;
  canonical_product_id: string | null;
  fluid_name: string;
  quantity_liters: number | string;
  total_cost: number | string | null;
  used_at: string;
};

function value(input: unknown) {
  const n = Number(input);
  return Number.isFinite(n) ? n : null;
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a,b) => a-b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function mad(values: number[], center: number) {
  return median(values.map((n) => Math.abs(n - center)));
}

function daysApart(a: string, b: string) {
  const ms = Math.abs(Date.parse(a) - Date.parse(b));
  return Number.isFinite(ms) ? ms / 86_400_000 : Number.POSITIVE_INFINITY;
}

function nearestPriorReading(readings: RuntimeReading[], at: string) {
  const target = Date.parse(at);
  let match: RuntimeReading | null = null;
  for (const row of readings) {
    const time = Date.parse(row.recorded_at);
    if (!Number.isFinite(time) || time > target) continue;
    if (!match || time > Date.parse(match.recorded_at)) match = row;
  }
  if (!match || daysApart(match.recorded_at, at) > 30) return null;
  return match;
}

function evidenceScore(input: { runtimeReadings: number; usageEvents: number; wasteEvents: number; plans: number }) {
  const components = {
    runtime: Math.min(40, input.runtimeReadings * 8),
    fluidUsage: Math.min(30, input.usageEvents * 6),
    waste: Math.min(15, input.wasteEvents * 5),
    planning: input.plans > 0 ? 15 : 0,
  };
  const total = components.runtime + components.fluidUsage + components.waste + components.planning;
  return {
    total,
    band: total >= 75 ? 'high' : total >= 45 ? 'medium' : 'low',
    components,
  };
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a inteligencia de condición.' }, { status: 403 });
  }

  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 2);
  const sinceIso = since.toISOString();

  const [assetsResult, runtimeResult, usageResult, wasteResult, plansResult, reviewsResult] = await Promise.all([
    context.supabase
      .from('maintenance_canonical_assets_v1')
      .select('id,asset_code,name,asset_type,category,manufacturer,model,cost_center_code')
      .eq('organization_id', context.organizationId)
      .limit(5000),
    context.supabase
      .from('asset_runtime_readings')
      .select('id,canonical_asset_id,meter_hours,recorded_at')
      .eq('organization_id', context.organizationId)
      .gte('recorded_at', sinceIso)
      .order('recorded_at', { ascending: true })
      .limit(20000),
    context.supabase
      .from('maintenance_fluid_usage_records')
      .select('id,canonical_asset_id,canonical_product_id,fluid_name,quantity_liters,total_cost,used_at')
      .eq('organization_id', context.organizationId)
      .gte('used_at', sinceIso)
      .order('used_at', { ascending: true })
      .limit(20000),
    context.supabase
      .from('maintenance_waste_records')
      .select('id,canonical_asset_id,quantity,unit,generated_at')
      .eq('organization_id', context.organizationId)
      .gte('generated_at', sinceIso)
      .order('generated_at', { ascending: true })
      .limit(20000),
    context.supabase
      .from('maintenance_fluid_plans')
      .select('id,canonical_asset_id,canonical_product_id,fluid_name,planned_input_liters,active')
      .eq('organization_id', context.organizationId)
      .eq('active', true)
      .limit(5000),
    context.supabase
      .from('maintenance_condition_signal_reviews')
      .select('signal_key,decision,decision_note,reviewed_at')
      .eq('organization_id', context.organizationId)
      .limit(5000),
  ]);

  for (const result of [assetsResult,runtimeResult,usageResult,wasteResult,plansResult,reviewsResult]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const assets = assetsResult.data || [];
  const runtime = (runtimeResult.data || []) as RuntimeReading[];
  const usage = (usageResult.data || []) as FluidUsage[];
  const waste = wasteResult.data || [];
  const plans = plansResult.data || [];
  const reviews = new Map((reviewsResult.data || []).map((row) => [row.signal_key, row]));

  const runtimeByAsset = new Map<string, RuntimeReading[]>();
  for (const row of runtime) {
    const list = runtimeByAsset.get(row.canonical_asset_id) || [];
    list.push(row);
    runtimeByAsset.set(row.canonical_asset_id, list);
  }

  const usageByAsset = new Map<string, FluidUsage[]>();
  for (const row of usage) {
    const list = usageByAsset.get(row.canonical_asset_id) || [];
    list.push(row);
    usageByAsset.set(row.canonical_asset_id, list);
  }

  const wasteCount = new Map<string, number>();
  for (const row of waste) wasteCount.set(row.canonical_asset_id, (wasteCount.get(row.canonical_asset_id) || 0) + 1);

  const planCount = new Map<string, number>();
  for (const row of plans) planCount.set(row.canonical_asset_id, (planCount.get(row.canonical_asset_id) || 0) + 1);

  const signals: any[] = [];
  const equipment = assets.map((asset) => {
    const readings = runtimeByAsset.get(asset.id) || [];
    const events = usageByAsset.get(asset.id) || [];
    const evidence = evidenceScore({
      runtimeReadings: readings.length,
      usageEvents: events.length,
      wasteEvents: wasteCount.get(asset.id) || 0,
      plans: planCount.get(asset.id) || 0,
    });

    const derivedIntervals: Array<{ usageId: string; at: string; rate: number; hours: number; liters: number }> = [];
    for (let index = 1; index < events.length; index += 1) {
      const current = events[index];
      const previous = events[index - 1];
      const currentReading = nearestPriorReading(readings, current.used_at);
      const previousReading = nearestPriorReading(readings, previous.used_at);
      const currentMeter = value(currentReading?.meter_hours);
      const previousMeter = value(previousReading?.meter_hours);
      const liters = value(current.quantity_liters);
      if (currentMeter === null || previousMeter === null || liters === null) continue;
      const hours = currentMeter - previousMeter;
      if (hours <= 0) continue;
      derivedIntervals.push({ usageId: current.id, at: current.used_at, rate: liters / hours, hours, liters });
    }

    let baseline: any = null;
    let conditionState: 'insufficient' | 'normal' | 'review' = 'insufficient';

    if (derivedIntervals.length >= 4) {
      const latest = derivedIntervals[derivedIntervals.length - 1];
      const history = derivedIntervals.slice(0, -1).map((row) => row.rate);
      const center = median(history);
      if (center !== null && center > 0) {
        const dispersion = mad(history, center) ?? 0;
        const robustScale = dispersion * 1.4826;
        const robustZ = robustScale > 0 ? Math.abs(latest.rate - center) / robustScale : null;
        const changeRatio = (latest.rate - center) / center;
        const enoughDeviation = Math.abs(changeRatio) >= 0.5;
        const statisticallySeparated = robustZ === null ? Math.abs(changeRatio) >= 0.75 : robustZ >= 3.5;
        conditionState = enoughDeviation && statisticallySeparated ? 'review' : 'normal';
        baseline = {
          metric: 'fluid_liters_per_operating_hour_between_usage_events',
          samples: history.length,
          median: center,
          mad: dispersion,
          latest: latest.rate,
          changeRatio,
          robustZ,
        };

        if (conditionState === 'review') {
          const direction = changeRatio > 0 ? 'increase' : 'decrease';
          const signalKey = ['fluid_rate_shift', asset.id, latest.usageId].join(':');
          const review = reviews.get(signalKey) || null;
          signals.push({
            signalKey,
            signalType: 'fluid_rate_shift',
            assetId: asset.id,
            assetCode: asset.asset_code,
            assetName: asset.name,
            severity: Math.abs(changeRatio) >= 1 ? 'high' : 'medium',
            direction,
            metric: latest.rate,
            baseline: center,
            changeRatio,
            robustZ,
            evidenceScore: evidence,
            latestAt: latest.at,
            explanation: direction === 'increase'
              ? 'El consumo por hora entre eventos de fluido aumentó respecto de la mediana histórica del mismo equipo.'
              : 'El consumo por hora entre eventos de fluido disminuyó respecto de la mediana histórica del mismo equipo.',
            nextAction: 'Revisar OT, lectura de horómetro y registro de fluido antes de atribuir una causa mecánica.',
            review,
          });
        }
      }
    }

    return {
      assetId: asset.id,
      assetCode: asset.asset_code,
      assetName: asset.name,
      assetType: asset.asset_type,
      site: asset.cost_center_code,
      evidence,
      runtimeReadings: readings.length,
      usageEvents: events.length,
      wasteEvents: wasteCount.get(asset.id) || 0,
      fluidPlans: planCount.get(asset.id) || 0,
      derivedRateIntervals: derivedIntervals.length,
      conditionState,
      baseline,
    };
  }).sort((a,b) => b.evidence.total - a.evidence.total);

  const productUsage = new Map<string, number[]>();
  for (const row of usage) {
    if (!row.canonical_product_id) continue;
    const liters = value(row.quantity_liters);
    if (liters === null || liters <= 0) continue;
    const list = productUsage.get(row.canonical_product_id) || [];
    list.push(liters);
    productUsage.set(row.canonical_product_id, list);
  }

  const forecastEvidence = Array.from(productUsage.entries()).map(([productId, values]) => {
    if (values.length < 3) return { productId, samples: values.length, empiricalRangeReady: false, lowFactor: null, highFactor: null };
    const center = median(values);
    if (center === null || center <= 0) return { productId, samples: values.length, empiricalRangeReady: false, lowFactor: null, highFactor: null };
    const dispersion = mad(values, center) ?? 0;
    const low = Math.max(0, center - 1.4826 * dispersion);
    const high = center + 1.4826 * dispersion;
    return {
      productId,
      samples: values.length,
      empiricalRangeReady: true,
      lowFactor: low / center,
      highFactor: high / center,
    };
  });

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      assets: equipment.length,
      assetsWithEvidence: equipment.filter((row) => row.evidence.total > 0).length,
      noEvidence: equipment.filter((row) => row.evidence.total === 0).length,
      highEvidence: equipment.filter((row) => row.evidence.total > 0 && row.evidence.band === 'high').length,
      mediumEvidence: equipment.filter((row) => row.evidence.total > 0 && row.evidence.band === 'medium').length,
      lowEvidence: equipment.filter((row) => row.evidence.total > 0 && row.evidence.band === 'low').length,
      reviewSignals: signals.filter((row) => !row.review || row.review.decision === 'monitor').length,
      reviewedSignals: signals.filter((row) => row.review && row.review.decision !== 'monitor').length,
    },
    equipment,
    signals,
    forecastEvidence,
    methodology: {
      evidenceScore: {
        runtime: '8 points per runtime reading, max 40',
        fluidUsage: '6 points per fluid usage event, max 30',
        waste: '5 points per waste event, max 15',
        planning: '15 points when at least one active fluid plan exists',
        meaning: 'Operational evidence readiness, not mechanical health.',
      },
      anomaly: {
        minimumDerivedIntervals: 4,
        baseline: 'median of prior equipment-specific liters/hour intervals',
        dispersion: 'MAD × 1.4826',
        reviewRule: 'absolute change >= 50% and robust separation >= 3.5; if dispersion is zero, change >= 75%',
        meaning: 'Derived review signal only; never a diagnosis or automatic work order.',
      },
      forecastRange: {
        minimumSamples: 3,
        range: 'median ± 1.4826 × MAD of historical usage quantities',
        meaning: 'Empirical uncertainty factor; omitted when history is insufficient.',
      },
    },
    boundaries: {
      createsWorkOrder: false,
      changesAssetState: false,
      mechanicalDiagnosis: false,
      insufficientHistoryCreatesSignal: false,
    },
  });
}
