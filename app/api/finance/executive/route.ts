export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const organizationId = context.organizationId;
    const [overview, assets, products, suppliers, costCenters, validation, recent, alerts, operationalProcurement, operationalEvents, treasury, treasuryAging, cashForecast, laudusReview, laudusFixedAssetReview, laudusOpenPage1, laudusOpenPage2] = await Promise.all([
      context.supabase.from('canonical_finance_overview').select('*').eq('organization_id', organizationId).maybeSingle(),
      context.supabase.from('canonical_finance_assets').select('*').eq('organization_id', organizationId).order('recognized_clp', { ascending: false }).limit(10),
      context.supabase.from('canonical_finance_products').select('*').eq('organization_id', organizationId).order('committed_clp', { ascending: false }).limit(10),
      context.supabase.from('canonical_finance_suppliers').select('*').eq('organization_id', organizationId).order('committed_clp', { ascending: false }).limit(10),
      context.supabase.from('canonical_finance_cost_centers').select('*').eq('organization_id', organizationId).order('committed_clp', { ascending: false }).limit(10),
      context.supabase.from('latest_canonical_financial_validation').select('*').eq('organization_id', organizationId).maybeSingle(),
      context.supabase.from('canonical_finance_source_audit').select('event_id,event_at,recognition_status,source_table,source_record_id,amount,currency,description,cost_center_code,metadata').eq('organization_id', organizationId).order('event_at', { ascending: false }).limit(20),
      context.supabase.from('canonical_finance_alerts').select('*').eq('organization_id', organizationId).gt('exception_count', 0).order('severity', { ascending: true }),
      context.supabase.from('operational_procurement_finance_summary_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
      context.supabase.from('operational_procurement_finance_ledger_v1').select('event_id,event_at,event_type,recognition_status,source_table,source_record_id,work_order_id,canonical_asset_id,canonical_product_id,supplier_id,cost_center_code,amount,currency,description,metadata').eq('organization_id', organizationId).order('event_at', { ascending: false }).limit(20),
      context.supabase.from('procurement_treasury_summary_v1').select('*').eq('organization_id', organizationId).order('currency', { ascending: true }),
      context.supabase.from('procurement_accounts_payable_aging_summary_v1').select('*').eq('organization_id', organizationId).order('outstanding_amount', { ascending: false }).limit(30),
      context.supabase.from('procurement_cash_forecast_summary_v1').select('*').eq('organization_id', organizationId).order('currency', { ascending: true }),
      context.supabase.rpc('motil_laudus_finance_review_queue', { p_organization_id: organizationId, p_limit: 10 }),
      context.supabase.rpc('motil_laudus_fixed_asset_review_queue', { p_organization_id: organizationId, p_limit: 1000 }),
      context.supabase
        .from('laudus_purchase_invoice_payment_status_service_v1')
        .select('supplier_name,outstanding_amount,due_date')
        .eq('organization_id', organizationId)
        .gt('outstanding_amount', 0)
        .order('outstanding_amount', { ascending: false })
        .range(0, 999),
      context.supabase
        .from('laudus_purchase_invoice_payment_status_service_v1')
        .select('supplier_name,outstanding_amount,due_date')
        .eq('organization_id', organizationId)
        .gt('outstanding_amount', 0)
        .order('outstanding_amount', { ascending: false })
        .range(1000, 1999),
    ]);

    const error = overview.error || assets.error || products.error || suppliers.error || costCenters.error || validation.error || recent.error || alerts.error || operationalProcurement.error || operationalEvents.error || treasury.error || treasuryAging.error || cashForecast.error || laudusReview.error || laudusFixedAssetReview.error || laudusOpenPage1.error || laudusOpenPage2.error;
    if (error) throw error;

    const laudusOpen = [...(laudusOpenPage1.data || []), ...(laudusOpenPage2.data || [])];
    const today = new Date();
    const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
    const agingOrder = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', '>90 días', 'Sin fecha'];
    const agingMap = new Map<string, { bucket: string; invoices: number; amount: number }>();
    const supplierMap = new Map<string, { supplier: string; invoices: number; outstanding: number; overdue: number; maxDaysOverdue: number }>();

    for (const row of laudusOpen) {
      const outstanding = Number(row.outstanding_amount || 0);
      const due = typeof row.due_date === 'string' && row.due_date ? new Date(row.due_date) : null;
      const dueUtc = due && !Number.isNaN(due.getTime())
        ? Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate())
        : null;
      const daysOverdue = dueUtc === null ? null : Math.floor((todayUtc - dueUtc) / 86400000);
      const bucket =
        daysOverdue === null ? 'Sin fecha' :
        daysOverdue <= 0 ? 'Por vencer' :
        daysOverdue <= 30 ? '1–30 días' :
        daysOverdue <= 60 ? '31–60 días' :
        daysOverdue <= 90 ? '61–90 días' :
        '>90 días';

      const aging = agingMap.get(bucket) || { bucket, invoices: 0, amount: 0 };
      aging.invoices += 1;
      aging.amount += outstanding;
      agingMap.set(bucket, aging);

      const supplier = String(row.supplier_name || '').trim() || 'Sin identificar';
      const pressure = supplierMap.get(supplier) || { supplier, invoices: 0, outstanding: 0, overdue: 0, maxDaysOverdue: 0 };
      pressure.invoices += 1;
      pressure.outstanding += outstanding;
      if (daysOverdue !== null && daysOverdue > 0) {
        pressure.overdue += outstanding;
        pressure.maxDaysOverdue = Math.max(pressure.maxDaysOverdue, daysOverdue);
      }
      supplierMap.set(supplier, pressure);
    }

    const laudusAging = agingOrder
      .map((bucket) => agingMap.get(bucket))
      .filter((row): row is { bucket: string; invoices: number; amount: number } => Boolean(row));
    const laudusSupplierPressure = [...supplierMap.values()]
      .sort((a, b) => b.outstanding - a.outstanding)
      .slice(0, 12);

    const pressureHorizons = [
      { label: 'Hoy', days: 0 },
      { label: '+7 días', days: 7 },
      { label: '+30 días', days: 30 },
      { label: '+60 días', days: 60 },
    ];
    const laudusPressureTrajectory = pressureHorizons.map(({ label, days }) => {
      const horizonUtc = todayUtc + days * 86400000;
      let current = 0;
      let overdue = 0;
      let olderThan90 = 0;
      let noDueDate = 0;
      for (const row of laudusOpen) {
        const outstanding = Number(row.outstanding_amount || 0);
        const due = typeof row.due_date === 'string' && row.due_date ? new Date(row.due_date) : null;
        if (!due || Number.isNaN(due.getTime())) {
          noDueDate += outstanding;
          continue;
        }
        const dueUtc = Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate());
        const daysOverdueAtHorizon = Math.floor((horizonUtc - dueUtc) / 86400000);
        if (daysOverdueAtHorizon <= 0) current += outstanding;
        else overdue += outstanding;
        if (daysOverdueAtHorizon > 90) olderThan90 += outstanding;
      }
      return { label, days, current, overdue, olderThan90, noDueDate };
    });


    const fixedAssetPayload = (laudusFixedAssetReview.data || {}) as {
      summary?: Record<string, unknown>;
      queue?: Array<Record<string, unknown>>;
    };
    const fixedAssetQueue = Array.isArray(fixedAssetPayload.queue) ? fixedAssetPayload.queue : [];
    const strongAssetCandidates = fixedAssetQueue.filter((row) =>
      ['strong_identifier_candidate', 'strong_candidate'].includes(String(row.evidence_level || '')),
    );
    const candidateAssetIds = [...new Set(
      strongAssetCandidates
        .map((row) => String(row.canonical_asset_id || ''))
        .filter(Boolean),
    )];
    const maintenanceEconomics = candidateAssetIds.length > 0
      ? await context.supabase
          .from('maintenance_asset_economic_history_v1')
          .select('canonical_asset_id,asset_code,asset_name,fiscal_year,movement_count,historical_total_cost,last_cost_date')
          .eq('organization_id', organizationId)
          .in('canonical_asset_id', candidateAssetIds)
      : { data: [], error: null };
    if (maintenanceEconomics.error) throw maintenanceEconomics.error;

    const maintenanceByAsset = new Map<string, { cost: number; movements: number; lastCostDate: string | null }>();
    for (const row of maintenanceEconomics.data || []) {
      const id = String(row.canonical_asset_id || '');
      if (!id) continue;
      const current = maintenanceByAsset.get(id) || { cost: 0, movements: 0, lastCostDate: null };
      current.cost += Number(row.historical_total_cost || 0);
      current.movements += Number(row.movement_count || 0);
      const date = typeof row.last_cost_date === 'string' ? row.last_cost_date : null;
      if (date && (!current.lastCostDate || date > current.lastCostDate)) current.lastCostDate = date;
      maintenanceByAsset.set(id, current);
    }

    const now = new Date();
    const assetEconomics = strongAssetCandidates.map((row) => {
      const acquisitionDate = typeof row.acquisition_date === 'string' ? row.acquisition_date : null;
      const usefulLifeYears = Number(row.useful_life || 0);
      const acquisition = acquisitionDate ? new Date(acquisitionDate) : null;
      const elapsedYears = acquisition && !Number.isNaN(acquisition.getTime())
        ? Math.max(0, (now.getTime() - acquisition.getTime()) / (365.25 * 86400000))
        : null;
      const lifeConsumedPct =
        elapsedYears !== null && usefulLifeYears > 0
          ? Math.max(0, Math.min(1.5, elapsedYears / usefulLifeYears))
          : null;
      const estimatedRetirementDate =
        acquisition && !Number.isNaN(acquisition.getTime()) && usefulLifeYears > 0
          ? new Date(acquisition.getFullYear() + usefulLifeYears, acquisition.getMonth(), acquisition.getDate()).toISOString().slice(0, 10)
          : null;
      const maintenance = maintenanceByAsset.get(String(row.canonical_asset_id || '')) || { cost: 0, movements: 0, lastCostDate: null };
      return {
        laudusExternalId: row.laudus_external_id || null,
        laudusName: row.laudus_name || null,
        canonicalAssetId: row.canonical_asset_id || null,
        canonicalAssetCode: row.canonical_asset_code || null,
        canonicalAssetName: row.canonical_asset_name || null,
        evidenceLevel: row.evidence_level || null,
        exactPlateSupport: Boolean(row.exact_plate_support),
        exactSerialSupport: Boolean(row.exact_serial_support),
        acquisitionDate,
        usefulLifeYears,
        lifeConsumedPct,
        estimatedRetirementDate,
        depreciationType: row.depreciation_type || null,
        acquisitionCost: row.acquisition_cost ?? null,
        maintenanceCost: maintenance.cost,
        maintenanceMovements: maintenance.movements,
        lastMaintenanceCostDate: maintenance.lastCostDate,
      };
    });

    const assetEconomicsSummary = {
      laudusAssets: Number(fixedAssetPayload.summary?.laudus_assets || 0),
      candidateRows: Number(fixedAssetPayload.summary?.candidate_rows || fixedAssetQueue.length),
      strongCandidates: assetEconomics.length,
      withAcquisitionCost: assetEconomics.filter((row) => Number(row.acquisitionCost || 0) > 0).length,
      withMaintenanceHistory: assetEconomics.filter((row) => row.maintenanceCost > 0).length,
      fullyConsumedByCalendar: assetEconomics.filter((row) => Number(row.lifeConsumedPct || 0) >= 1).length,
    };

    return NextResponse.json({
      overview: overview.data || null,
      topAssets: assets.data || [],
      topProducts: products.data || [],
      topSuppliers: suppliers.data || [],
      topCostCenters: costCenters.data || [],
      validation: validation.data || null,
      recentEvents: recent.data || [],
      alerts: alerts.data || [],
      operationalProcurement: operationalProcurement.data || null,
      operationalProcurementEvents: operationalEvents.data || [],
      treasury: treasury.data || [],
      treasuryAging: treasuryAging.data || [],
      cashForecast: cashForecast.data || [],
      laudusReview: laudusReview.data || null,
      laudusAging,
      laudusSupplierPressure,
      laudusPressureTrajectory,
      assetEconomics,
      assetEconomicsSummary,
      certification: {
        origin: 'CANONICAL+ERP',
        currency: 'CLP',
        sources: ['canonical.asset_costs', 'canonical.purchase_order_lines', 'public.procurement_operational_order_lines', 'public.procurement_operational_receipt_lines'],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el resumen financiero certificado';
    console.error('[finance/executive]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
