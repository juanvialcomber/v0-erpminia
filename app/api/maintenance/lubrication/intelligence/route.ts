export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

function n(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : 0;
}

function nullableNumber(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function daysBetween(a: unknown, b: unknown) {
  const start = Date.parse(String(a || ''));
  const end = Date.parse(String(b || ''));
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) return null;
  return (end - start) / 86_400_000;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'Sin acceso a inteligencia de lubricación.' }, { status: 403 });
  }

  const since = new Date();
  since.setUTCFullYear(since.getUTCFullYear() - 1);
  const sinceIso = since.toISOString();

  const [usageResult, wasteResult, runtimeResult, planResult, scheduleResult, inventoryResult, assetResult, orderResult] = await Promise.all([
    context.supabase
      .from('maintenance_fluid_usage_records')
      .select('*')
      .eq('organization_id', context.organizationId)
      .gte('used_at', sinceIso)
      .order('used_at', { ascending: false })
      .limit(5000),
    context.supabase
      .from('maintenance_waste_records')
      .select('id,work_order_id,canonical_asset_id,waste_name,quantity,unit,status,generated_at,removed_at,closed_at,classification')
      .eq('organization_id', context.organizationId)
      .gte('generated_at', sinceIso)
      .order('generated_at', { ascending: false })
      .limit(5000),
    context.supabase
      .from('asset_runtime_summary_v1')
      .select('canonical_asset_id,asset_code,asset_name,reading_count,first_reading_at,last_reading_at,latest_meter_hours,observed_operating_hours,usable_for_rate_metrics')
      .eq('organization_id', context.organizationId)
      .limit(5000),
    context.supabase
      .from('maintenance_fluid_plans')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('active', true)
      .limit(5000),
    context.supabase
      .from('preventive_maintenance_schedules')
      .select('id,canonical_asset_id,asset_id,task_name,frequency_days,frequency_hours,next_scheduled_date,current_meter_snapshot,next_due_meter,meter_unit,enabled')
      .eq('organization_id', context.organizationId)
      .eq('enabled', true)
      .limit(5000),
    context.supabase
      .from('inventory_intelligence_position_v1')
      .select('product_id,product_code,product_name,family,unit,quantity_available,unit_cost,stock_value,warehouse_code,validation_status')
      .eq('organization_id', context.organizationId)
      .eq('family', 'Lubricante')
      .limit(5000),
    context.supabase
      .from('maintenance_canonical_assets_v1')
      .select('id,asset_code,name,asset_type,category,manufacturer,model,cost_center_code')
      .eq('organization_id', context.organizationId)
      .limit(5000),
    context.supabase
      .from('maintenance_work_orders')
      .select('id,canonical_asset_id,asset_id,workshop_site,work_order_number')
      .eq('organization_id', context.organizationId)
      .limit(5000),
  ]);

  for (const result of [usageResult,wasteResult,runtimeResult,planResult,scheduleResult,inventoryResult,assetResult,orderResult]) {
    if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 });
  }

  const usage = usageResult.data || [];
  const waste = wasteResult.data || [];
  const runtime = runtimeResult.data || [];
  const plans = planResult.data || [];
  const schedules = scheduleResult.data || [];
  const inventory = inventoryResult.data || [];
  const assets = assetResult.data || [];
  const orders = orderResult.data || [];

  const assetMap = new Map(assets.map((row) => [row.id, row]));
  const runtimeMap = new Map(runtime.map((row) => [row.canonical_asset_id, row]));
  const scheduleMap = new Map(schedules.map((row) => [row.id, row]));
  const orderMap = new Map(orders.map((row) => [row.id, row]));

  const inventoryByProduct = new Map<string, { productId: string; code: string | null; name: string | null; unit: string | null; quantity: number; value: number; unitCost: number | null; warehouses: string[] }>();
  for (const row of inventory) {
    const productId = String(row.product_id || '');
    if (!productId) continue;
    const current = inventoryByProduct.get(productId) || {
      productId,
      code: row.product_code || null,
      name: row.product_name || null,
      unit: row.unit || null,
      quantity: 0,
      value: 0,
      unitCost: nullableNumber(row.unit_cost),
      warehouses: [],
    };
    current.quantity += n(row.quantity_available);
    current.value += n(row.stock_value);
    if (row.warehouse_code && !current.warehouses.includes(row.warehouse_code)) current.warehouses.push(row.warehouse_code);
    inventoryByProduct.set(productId, current);
  }

  const byAsset = new Map<string, {
    assetId: string; inputLiters: number; wasteLiters: number; cost: number; costCoveredLiters: number; events: number; sites: Set<string>;
  }>();

  for (const row of usage) {
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const current = byAsset.get(assetId) || { assetId, inputLiters: 0, wasteLiters: 0, cost: 0, costCoveredLiters: 0, events: 0, sites: new Set<string>() };
    current.inputLiters += n(row.quantity_liters);
    current.events += 1;
    if (row.total_cost !== null && row.total_cost !== undefined) {
      current.cost += n(row.total_cost);
      current.costCoveredLiters += n(row.quantity_liters);
    }
    const order = orderMap.get(row.work_order_id);
    if (order?.workshop_site) current.sites.add(order.workshop_site);
    byAsset.set(assetId, current);
  }

  for (const row of waste) {
    if (String(row.unit || '').toLowerCase() !== 'l') continue;
    const assetId = String(row.canonical_asset_id || '');
    if (!assetId) continue;
    const current = byAsset.get(assetId) || { assetId, inputLiters: 0, wasteLiters: 0, cost: 0, costCoveredLiters: 0, events: 0, sites: new Set<string>() };
    current.wasteLiters += n(row.quantity);
    const order = orderMap.get(row.work_order_id);
    if (order?.workshop_site) current.sites.add(order.workshop_site);
    byAsset.set(assetId, current);
  }

  const equipment = Array.from(byAsset.values()).map((row) => {
    const asset = assetMap.get(row.assetId);
    const runtimeRow = runtimeMap.get(row.assetId);
    const hours = runtimeRow?.usable_for_rate_metrics ? nullableNumber(runtimeRow.observed_operating_hours) : null;
    const litersPerHour = hours && hours > 0 && row.inputLiters > 0 ? row.inputLiters / hours : null;
    const costPerHour = hours && hours > 0 && row.costCoveredLiters > 0 ? row.cost / hours : null;
    const balanceDelta = row.inputLiters > 0 || row.wasteLiters > 0 ? row.inputLiters - row.wasteLiters : null;
    const reviewState = row.wasteLiters > row.inputLiters && row.inputLiters > 0 ? 'review_required' : 'ok';

    return {
      assetId: row.assetId,
      assetCode: asset?.asset_code || runtimeRow?.asset_code || null,
      assetName: asset?.name || runtimeRow?.asset_name || null,
      site: Array.from(row.sites).join(', ') || null,
      inputLiters: row.inputLiters,
      wasteLiters: row.wasteLiters,
      balanceDeltaLiters: balanceDelta,
      runtimeHours: hours,
      litersPerHour,
      costClp: row.costCoveredLiters > 0 ? row.cost : null,
      costPerHourClp: costPerHour,
      usageEvents: row.events,
      reviewState,
      evidenceState: hours === null ? 'partial_runtime' : 'derived',
    };
  }).sort((a,b) => b.inputLiters - a.inputLiters);

  let projectedInput30 = 0;
  let projectedInput365 = 0;
  let projectedWaste30 = 0;
  let projectedWaste365 = 0;
  let projectedWasteCoveredPlans = 0;
  let projectedPlans = 0;
  const productDemand = new Map<string, { productId: string; name: string; demand30Liters: number; demand365Liters: number; stockLiters: number | null; stockValue: number; unit: string | null; warehouses: string[]; conversionState: string }>();

  for (const plan of plans) {
    const schedule = scheduleMap.get(plan.preventive_schedule_id);
    if (!schedule) continue;

    let events30: number | null = null;
    let events365: number | null = null;
    const frequencyDays = nullableNumber(schedule.frequency_days);
    const frequencyHours = nullableNumber(schedule.frequency_hours);

    if (frequencyDays && frequencyDays > 0) {
      events30 = 30 / frequencyDays;
      events365 = 365 / frequencyDays;
    } else if (frequencyHours && frequencyHours > 0) {
      const runtimeRow = runtimeMap.get(plan.canonical_asset_id);
      const observedHours = runtimeRow?.usable_for_rate_metrics ? nullableNumber(runtimeRow.observed_operating_hours) : null;
      const periodDays = runtimeRow?.usable_for_rate_metrics ? daysBetween(runtimeRow.first_reading_at, runtimeRow.last_reading_at) : null;
      if (observedHours && observedHours > 0 && periodDays && periodDays > 0) {
        const hoursPerDay = observedHours / periodDays;
        events30 = (hoursPerDay * 30) / frequencyHours;
        events365 = (hoursPerDay * 365) / frequencyHours;
      }
    }

    if (events30 === null || events365 === null) continue;
    projectedPlans += 1;
    const inputPerEvent = n(plan.planned_input_liters);
    projectedInput30 += events30 * inputPerEvent;
    projectedInput365 += events365 * inputPerEvent;

    if (plan.planned_waste_liters !== null && plan.planned_waste_liters !== undefined) {
      const wastePerEvent = n(plan.planned_waste_liters);
      projectedWaste30 += events30 * wastePerEvent;
      projectedWaste365 += events365 * wastePerEvent;
      projectedWasteCoveredPlans += 1;
    }

    const productId = String(plan.canonical_product_id || '');
    if (productId) {
      const stock = inventoryByProduct.get(productId);
      const conversion = nullableNumber(plan.liters_per_inventory_unit);
      const normalizedUnit = String(stock?.unit || '').toLowerCase();
      const stockLiters = stock
        ? normalizedUnit.includes('litro')
          ? stock.quantity
          : conversion && conversion > 0
            ? stock.quantity * conversion
            : null
        : 0;
      const current = productDemand.get(productId) || {
        productId,
        name: plan.fluid_name,
        demand30Liters: 0,
        demand365Liters: 0,
        stockLiters,
        stockValue: stock?.value || 0,
        unit: stock?.unit || null,
        warehouses: stock?.warehouses || [],
        conversionState: stockLiters === null ? 'conversion_required' : 'ready',
      };
      current.demand30Liters += events30 * inputPerEvent;
      current.demand365Liters += events365 * inputPerEvent;
      productDemand.set(productId, current);
    }
  }

  const warehousePlanning = Array.from(productDemand.values()).map((row) => ({
    ...row,
    gap30Liters: row.stockLiters === null ? null : row.stockLiters - row.demand30Liters,
    coverageDays: row.stockLiters === null || row.demand30Liters <= 0 ? null : (row.stockLiters / row.demand30Liters) * 30,
    state: row.stockLiters === null ? 'needs_conversion' : row.stockLiters < row.demand30Liters ? 'shortage_risk' : 'covered',
  })).sort((a,b) => (a.gap30Liters ?? Number.POSITIVE_INFINITY) - (b.gap30Liters ?? Number.POSITIVE_INFINITY));

  const stockValue = Array.from(inventoryByProduct.values()).reduce((sum,row) => sum + row.value, 0);
  const stockLitersKnown = Array.from(inventoryByProduct.values()).reduce((sum,row) => {
    return String(row.unit || '').toLowerCase().includes('litro') ? sum + row.quantity : sum;
  }, 0);

  const usableRuntime = runtime.filter((row) => row.usable_for_rate_metrics).length;
  const totalRuntimeAssets = runtime.length;

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      lubricantProducts: inventoryByProduct.size,
      lubricantStockValueClp: stockValue,
      lubricantStockLitersKnown: stockLitersKnown,
      actualInputLiters12m: usage.reduce((sum,row) => sum + n(row.quantity_liters), 0),
      actualWasteLiters12m: waste.filter((row) => String(row.unit || '').toLowerCase() === 'l').reduce((sum,row) => sum + n(row.quantity), 0),
      actualCostClp12m: usage.reduce((sum,row) => sum + n(row.total_cost), 0),
      projectedInputLiters30d: projectedPlans > 0 ? projectedInput30 : null,
      projectedInputLiters365d: projectedPlans > 0 ? projectedInput365 : null,
      projectedWasteLiters30d: projectedWasteCoveredPlans > 0 ? projectedWaste30 : null,
      projectedWasteLiters365d: projectedWasteCoveredPlans > 0 ? projectedWaste365 : null,
      runtimeCoverage: { usable: usableRuntime, total: totalRuntimeAssets },
      preventiveSchedules: schedules.length,
      fluidPlans: plans.length,
      projectedPlans,
      wasteProjectionCoveredPlans: projectedWasteCoveredPlans,
    },
    equipment,
    warehousePlanning,
    readiness: {
      actualFluidUsage: usage.length > 0 ? 'ready' : 'missing_usage',
      wasteHistory: waste.length > 0 ? 'ready' : 'missing_waste',
      runtimeRates: usableRuntime > 0 ? 'partial' : 'missing_runtime',
      preventivePlanning: schedules.length > 0 ? 'ready' : 'missing_schedules',
      fluidPlanning: plans.length > 0 ? 'ready' : 'missing_fluid_plans',
      warehouseStock: inventoryByProduct.size > 0 ? 'ready' : 'missing_stock',
    },
    formulas: {
      litersPerHour: 'actual_input_liters / observed_operating_hours',
      costPerHour: 'actual_cost_clp / observed_operating_hours',
      dayScheduleProjection: 'period_days / maintenance_frequency_days * planned_liters_per_event',
      hourScheduleProjection: 'observed_hours_per_day * period_days / maintenance_frequency_hours * planned_liters_per_event',
      warehouseGap30d: 'available_stock_liters - projected_input_liters_30d',
    },
    boundaries: {
      inventoryMutated: false,
      anomalyMeansMechanicalFailure: false,
      complianceCertified: false,
      missingInputsRemainNull: true,
    },
  });
}
