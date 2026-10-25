import { NextRequest, NextResponse } from 'next/server';
import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { routeOperationalQuery, type QueryCapability } from '@/lib/intelligence/query-router';
import { buildSkillPlan } from '@/lib/motil-ai/skills/orchestrator';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';

export type OperationalAssistantDomain = 'inventory' | 'procurement' | 'production' | 'finance';

const OPENAI_RESPONSES_URL = 'https://api.openai.com/v1/responses';
const DEFAULT_MODEL = 'gpt-5.6';
const FALLBACK_MODELS = ['gpt-5.6', 'gpt-5.6-terra', 'gpt-5.6-luna'];
const MAX_MESSAGE_CHARS = 12000;

type EvidenceBundle = {
  capability: OperationalAssistantDomain;
  sources: string[];
  toolsUsed: Array<{ name: string; mode: 'read' }>;
  payload: Record<string, unknown>;
};

function extractResponseText(payload: any) {
  for (const item of payload?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === 'output_text' && typeof content.text === 'string') return content.text.trim();
    }
  }
  return typeof payload?.output_text === 'string' ? payload.output_text.trim() : '';
}

async function callOpenAI(args: { instructions: string; input: string }) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY no está configurada en el servidor');

  const configuredModel = process.env.OPENAI_OPERATIONAL_ASSISTANT_MODEL?.trim();
  const models = Array.from(new Set([configuredModel, DEFAULT_MODEL, ...FALLBACK_MODELS].filter(Boolean))) as string[];
  let lastError = 'No hay un modelo de OpenAI disponible';

  for (const model of models) {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, instructions: args.instructions, input: args.input, reasoning: { effort: 'medium' }, max_output_tokens: 2600 }),
      cache: 'no-store',
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) {
      const detail = payload?.error?.message || `OpenAI respondió ${response.status}`;
      lastError = detail;
      if (/invalid model|model.*not.*found|does not exist|not permitted|not available/i.test(detail)) continue;
      throw new Error(detail);
    }
    const text = extractResponseText(payload);
    if (!text) throw new Error('OpenAI no devolvió texto utilizable');
    return { text, model: payload?.model || model, responseId: payload?.id || null };
  }
  throw new Error(lastError);
}

async function buildInventoryEvidence(context: OrganizationSuccessContext): Promise<EvidenceBundle> {
  const organizationId = context.organizationId;
  const [overview, freshness, negative, reorder, outOfStock] = await Promise.all([
    context.supabase.from('inventory_intelligence_overview_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
    context.supabase.from('canonical_inventory_current').select('snapshot_date').eq('organization_id', organizationId).order('snapshot_date', { ascending: false }).limit(1),
    context.supabase.from('inventory_intelligence_position_v1').select('product_code,product_name,family,unit,quantity_on_hand,quantity_reserved,quantity_available,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status').eq('organization_id', organizationId).eq('stock_status', 'negative').order('stock_value', { ascending: false }).limit(30),
    context.supabase.from('inventory_intelligence_position_v1').select('product_code,product_name,family,unit,quantity_on_hand,quantity_reserved,quantity_available,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status').eq('organization_id', organizationId).eq('stock_status', 'reorder').order('stock_value', { ascending: false }).limit(50),
    context.supabase.from('inventory_intelligence_position_v1').select('product_code,product_name,family,unit,quantity_on_hand,quantity_reserved,quantity_available,unit_cost,stock_value,stock_status,last_counted_date,warehouse_code,validation_status').eq('organization_id', organizationId).eq('stock_status', 'out_of_stock').order('stock_value', { ascending: false }).limit(40),
  ]);
  const failures = [overview.error, freshness.error, negative.error, reorder.error, outOfStock.error].filter(Boolean);
  if (failures.length) throw new Error((failures[0] as any)?.message || 'No se pudo cargar inventario canónico');
  return {
    capability: 'inventory',
    sources: ['canonical_inventory_current', 'inventory_intelligence_overview_v1', 'inventory_intelligence_position_v1'],
    toolsUsed: [{ name: 'read_inventory_overview', mode: 'read' }, { name: 'read_inventory_attention', mode: 'read' }, { name: 'read_inventory_freshness', mode: 'read' }],
    payload: {
      freshness: { latest_snapshot_date: freshness.data?.[0]?.snapshot_date || null, meaning: 'Fecha máxima disponible en canonical_inventory_current; no implica tiempo real.' },
      overview: overview.data || null,
      attention: { negative: negative.data || [], reorder: reorder.data || [], out_of_stock: outOfStock.data || [] },
      semantics: { stock_status: 'Estado derivado de existencias. No equivale por sí solo a criticidad operacional, riesgo de falla ni prioridad de compra.', value: 'Valorización de inventario según costo registrado; no reemplaza una cotización vigente.' },
    },
  };
}

async function buildProcurementEvidence(context: OrganizationSuccessContext): Promise<EvidenceBundle> {
  const organizationId = context.organizationId;
  const [overview, recentOrders, quality, reconciliation] = await Promise.all([
    context.supabase.from('procurement_overview').select('*').eq('organization_id', organizationId).maybeSingle(),
    context.supabase.from('canonical_purchase_orders_current').select('po_number,vendor_name,item_code,item_description,quantity,unit_price,total_amount,order_date,status,updated_at,cost_center_code').eq('organization_id', organizationId).order('order_date', { ascending: false }).limit(80),
    context.supabase.from('purchase_order_quality').select('purchase_order_id,order_number,order_date,supplier_name,line_count,distinct_product_count,header_net_amount,calculated_line_net_amount,net_amount_variance,warning_line_count,quality_status').eq('organization_id', organizationId).neq('quality_status', 'valid').order('order_date', { ascending: false }).limit(40),
    context.supabase.from('supplier_reconciliation_v1').select('source_supplier_name,match_status,match_confidence,match_notes').eq('organization_id', organizationId).eq('match_status', 'pending').order('source_supplier_name').limit(40),
  ]);
  const failures = [overview.error, recentOrders.error, quality.error, reconciliation.error].filter(Boolean);
  if (failures.length) throw new Error((failures[0] as any)?.message || 'No se pudo cargar compras canónicas');
  const recent = recentOrders.data || [];
  return {
    capability: 'procurement',
    sources: ['canonical_purchase_orders_current', 'procurement_overview', 'purchase_order_quality', 'supplier_reconciliation_v1'],
    toolsUsed: [{ name: 'read_procurement_overview', mode: 'read' }, { name: 'read_recent_purchase_orders', mode: 'read' }, { name: 'read_procurement_quality', mode: 'read' }],
    payload: {
      freshness: {
        latest_order_date: recent[0]?.order_date || overview.data?.last_purchase_date || null,
        latest_updated_at: recent.reduce((latest: string | null, row: any) => { const value = typeof row?.updated_at === 'string' ? row.updated_at : null; return value && (!latest || value > latest) ? value : latest; }, null),
        meaning: 'Última orden/actualización disponible en canonical_purchase_orders_current; no implica tiempo real.',
      },
      overview: overview.data || null,
      recent_orders: recent,
      quality_issues: quality.data || [],
      supplier_reconciliation_pending: reconciliation.data || [],
      semantics: { order_status: 'Se conserva el estado de la fuente. No se infiere entrega, recepción, pago ni cierre cuando esa evidencia no existe.', amounts: 'Montos y precios corresponden a la orden registrada; no se presentan como cotización vigente salvo evidencia explícita.' },
    },
  };
}

async function buildProductionEvidence(context: OrganizationSuccessContext): Promise<EvidenceBundle> {
  const organizationId = context.organizationId;
  const [fineCopper, fineFlow, metallurgy, drilling, movements, fidelity] = await Promise.all([
    context.supabase.from('production_fine_copper_daily_v1').select('operation_date,shifts,deterministic_shifts,treated_wet_metric_tons,mineral_dry_metric_tons,contained_feed_cu_metric_tons,recovered_fine_cu_metric_tons,avg_head_grade_pct,effective_recovery_pct,treated_wet_tons_without_fine,fine_coverage_state').eq('organization_id', organizationId).order('operation_date', { ascending: false }).limit(45),
    context.supabase.from('production_fine_flow_daily_v1').select('operation_date,movements,transported_wet_metric_tons,shifts,deterministic_shifts,treated_wet_metric_tons,mineral_dry_metric_tons,contained_feed_cu_metric_tons,recovered_fine_cu_metric_tons,fine_coverage_state,transport_treatment_delta_metric_tons,flow_state').eq('organization_id', organizationId).order('operation_date', { ascending: false }).limit(45),
    context.supabase.from('production_metallurgy_deterministic_v2').select('operation_date,shift_code,plant_validation_status,treated_metric_tons,mineral_moisture_pct,head_grade,concentrate_grade,tailings_grade,recovery_reported,fine_metal_reported,calculation_rule_version,metallurgy_state,mineral_dry_metric_tons,feed_fine_metric_tons,recovery_by_grades_pct,concentrate_dry_metric_tons,concentrate_fine_metric_tons,recovery_by_fine_balance_pct').eq('organization_id', organizationId).order('operation_date', { ascending: false }).limit(90),
    context.supabase.from('production_drilling_operational_summary_v1').select('*').eq('organization_id', organizationId).maybeSingle(),
    context.supabase.from('production_material_movements').select('movement_date,normalized_metric_tons,normalization_status,validation_status,material_classification,mine_name_raw,sector_name_raw').eq('organization_id', organizationId).order('movement_date', { ascending: false }).limit(80),
    context.supabase.from('production_source_fidelity_exceptions_v1').select('domain,exception_type,source_file,source_sheet,source_row,event_date,reference_code,description').eq('organization_id', organizationId).order('event_date', { ascending: false }).limit(60),
  ]);
  const failures = [fineCopper.error, fineFlow.error, metallurgy.error, drilling.error, movements.error, fidelity.error].filter(Boolean);
  if (failures.length) throw new Error((failures[0] as any)?.message || 'No se pudo cargar producción canónica');
  const copperRows = fineCopper.data || [];
  const flowRows = fineFlow.data || [];
  const movementRows = movements.data || [];
  return {
    capability: 'production',
    sources: ['production_fine_copper_daily_v1', 'production_fine_flow_daily_v1', 'production_metallurgy_deterministic_v2', 'production_drilling_operational_summary_v1', 'production_material_movements', 'production_source_fidelity_exceptions_v1'],
    toolsUsed: [{ name: 'read_production_daily_fine', mode: 'read' }, { name: 'read_production_flow', mode: 'read' }, { name: 'read_production_metallurgy', mode: 'read' }, { name: 'read_production_drilling_summary', mode: 'read' }, { name: 'read_production_fidelity', mode: 'read' }],
    payload: {
      freshness: { latest_fine_copper_date: copperRows[0]?.operation_date || null, latest_flow_date: flowRows[0]?.operation_date || null, latest_movement_date: movementRows[0]?.movement_date || null, drilling_max_date: drilling.data?.max_date || null, meaning: 'Fechas máximas disponibles por fuente. Ninguna de ellas implica telemetría o tiempo real.' },
      daily_fine_copper: copperRows,
      daily_flow: flowRows,
      recent_metallurgy: metallurgy.data || [],
      drilling_summary: drilling.data || null,
      recent_material_movements: movementRows,
      source_fidelity_exceptions: fidelity.data || [],
      semantics: { deterministic_metrics: 'Los cálculos determinísticos conservan reglas/versiones de cálculo y deben separarse de valores reportados por fuente.', fine_coverage: 'La cobertura de cobre fino puede ser incompleta; no se extrapola a días sin evidencia.', flow_delta: 'La diferencia transporte-tratamiento describe un balance observado, no una causa raíz.', drilling_status: 'Conteos fuera de servicio, sin dotación, energía o agua son frecuencia observada en reportes, no probabilidad futura.' },
    },
  };
}

async function buildFinanceEvidence(context: OrganizationSuccessContext): Promise<EvidenceBundle> {
  const organizationId = context.organizationId;
  const [overview, costCenters, suppliers, aging, cashForecast, laudusReview, fixedAssetReview, invoiceCoverageStartQuery, laudusOpenPage1, laudusOpenPage2, reconciliation, maintenanceCost] = await Promise.all([
    context.supabase.from('canonical_finance_overview').select('*').eq('organization_id', organizationId).maybeSingle(),
    context.supabase.from('canonical_finance_cost_centers').select('cost_center_code,event_count,recognized_clp,committed_clp,first_event_at,last_event_at').eq('organization_id', organizationId).order('committed_clp', { ascending: false }).limit(80),
    context.supabase.from('canonical_finance_suppliers').select('supplier_id,supplier_name,purchase_order_count,line_count,committed_clp,first_event_at,last_event_at').eq('organization_id', organizationId).order('committed_clp', { ascending: false }).limit(30),
    context.supabase.from('procurement_accounts_payable_aging_summary_v1').select('supplier_id,supplier_name,currency,aging_bucket,payable_count,outstanding_amount').eq('organization_id', organizationId).order('outstanding_amount', { ascending: false }).limit(50),
    context.supabase.from('procurement_cash_forecast_summary_v1').select('currency,open_payables,total_outstanding_amount,overdue_amount,due_next_7_amount,due_next_30_amount,due_next_60_amount,due_next_90_amount,due_after_90_amount,no_due_date_amount,no_due_date_count,next_due_date').eq('organization_id', organizationId).order('currency', { ascending: true }),
    context.supabase.rpc('motil_laudus_finance_review_queue', { p_organization_id: organizationId, p_limit: 10 }),
    context.supabase.rpc('motil_laudus_fixed_asset_review_queue', { p_organization_id: organizationId, p_limit: 1000 }),
    context.supabase
      .from('laudus_purchase_invoice_payment_status_service_v1')
      .select('issued_date')
      .eq('organization_id', organizationId)
      .not('issued_date', 'is', null)
      .order('issued_date', { ascending: true })
      .limit(1)
      .maybeSingle(),
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
    context.supabase.from('finance_asset_reconciliation_v1').select('finance_asset_code,finance_asset_name,canonical_asset_code,canonical_asset_name,candidate_count,reconciliation_status,match_method').eq('organization_id', organizationId).neq('reconciliation_status', 'resolved_exact').limit(40),
    context.supabase.from('maintenance_cost_by_cost_center_v1').select('cost_center_code,cost_center_name,audited_work_orders,parts_cost,labor_cost,external_cost,total_cost,average_cost_per_work_order,last_closed_at').eq('organization_id', organizationId).order('total_cost', { ascending: false }).limit(40),
  ]);
  const failures = [overview.error, costCenters.error, suppliers.error, aging.error, cashForecast.error, laudusReview.error, fixedAssetReview.error, invoiceCoverageStartQuery.error, laudusOpenPage1.error, laudusOpenPage2.error, reconciliation.error, maintenanceCost.error].filter(Boolean);
  if (failures.length) throw new Error((failures[0] as any)?.message || 'No se pudo cargar finanzas canónicas');
  const centers = costCenters.data || [];
  const latestCenterEvent = centers.reduce((latest: string | null, row: any) => { const value = typeof row?.last_event_at === 'string' ? row.last_event_at : null; return value && (!latest || value > latest) ? value : latest; }, null);

  const laudusOpen = [...(laudusOpenPage1.data || []), ...(laudusOpenPage2.data || [])];
  const today = new Date();
  const todayUtc = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const agingBuckets = new Map<string, { bucket: string; invoices: number; amount: number }>();
  const supplierPressure = new Map<string, { supplier: string; invoices: number; outstanding: number; overdue: number; maxDaysOverdue: number }>();
  for (const row of laudusOpen) {
    const outstanding = Number(row.outstanding_amount || 0);
    const due = typeof row.due_date === 'string' && row.due_date ? new Date(row.due_date) : null;
    const dueUtc = due && !Number.isNaN(due.getTime()) ? Date.UTC(due.getUTCFullYear(), due.getUTCMonth(), due.getUTCDate()) : null;
    const daysOverdue = dueUtc === null ? null : Math.floor((todayUtc - dueUtc) / 86400000);
    const bucket =
      daysOverdue === null ? 'Sin fecha' :
      daysOverdue <= 0 ? 'Por vencer' :
      daysOverdue <= 30 ? '1–30 días' :
      daysOverdue <= 60 ? '31–60 días' :
      daysOverdue <= 90 ? '61–90 días' :
      '>90 días';

    const age = agingBuckets.get(bucket) || { bucket, invoices: 0, amount: 0 };
    age.invoices += 1;
    age.amount += outstanding;
    agingBuckets.set(bucket, age);

    const supplier = String(row.supplier_name || '').trim() || 'Sin identificar';
    const pressure = supplierPressure.get(supplier) || { supplier, invoices: 0, outstanding: 0, overdue: 0, maxDaysOverdue: 0 };
    pressure.invoices += 1;
    pressure.outstanding += outstanding;
    if (daysOverdue !== null && daysOverdue > 0) {
      pressure.overdue += outstanding;
      pressure.maxDaysOverdue = Math.max(pressure.maxDaysOverdue, daysOverdue);
    }
    supplierPressure.set(supplier, pressure);
  }
  const laudusAging = ['Por vencer', '1–30 días', '31–60 días', '61–90 días', '>90 días', 'Sin fecha']
    .map((bucket) => agingBuckets.get(bucket))
    .filter(Boolean);
  const laudusSupplierPressure = [...supplierPressure.values()]
    .sort((a, b) => b.outstanding - a.outstanding)
    .slice(0, 12);

  const fixedAssetPayload = (fixedAssetReview.data || {}) as {
    summary?: Record<string, unknown>;
    queue?: Array<Record<string, unknown>>;
  };
  const fixedAssetQueue = Array.isArray(fixedAssetPayload.queue) ? fixedAssetPayload.queue : [];
  const fixedAssetStrong = fixedAssetQueue.filter((row) =>
    ['strong_identifier_candidate', 'strong_candidate'].includes(String(row.evidence_level || '')),
  );
  const fixedAssetIds = [...new Set(
    fixedAssetQueue.map((row) => String(row.canonical_asset_id || '')).filter(Boolean),
  )];
  const maintenanceEconomics = fixedAssetIds.length > 0
    ? await context.supabase
        .from('maintenance_asset_economic_history_v1')
        .select('canonical_asset_id,asset_code,asset_name,fiscal_year,movement_count,historical_total_cost,last_cost_date')
        .eq('organization_id', organizationId)
        .in('canonical_asset_id', fixedAssetIds)
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

  const invoiceCoverageStart =
    typeof invoiceCoverageStartQuery.data?.issued_date === 'string'
      ? invoiceCoverageStartQuery.data.issued_date.slice(0, 10)
      : null;

  const now = new Date();
  const assetEconomics = fixedAssetStrong.map((row) => {
    const acquisitionDate = typeof row.acquisition_date === 'string' ? row.acquisition_date : null;
    const acquisition = acquisitionDate ? new Date(acquisitionDate) : null;
    const usefulLifeYears = Number(row.useful_life || 0);
    const elapsedYears = acquisition && !Number.isNaN(acquisition.getTime())
      ? Math.max(0, (now.getTime() - acquisition.getTime()) / (365.25 * 86400000))
      : null;
    const lifeConsumedPct =
      elapsedYears !== null && usefulLifeYears > 0
        ? Math.max(0, Math.min(1.5, elapsedYears / usefulLifeYears))
        : null;
    const maintenance = maintenanceByAsset.get(String(row.canonical_asset_id || '')) || { cost: 0, movements: 0, lastCostDate: null };
    return {
      laudus_name: row.laudus_name || null,
      canonical_asset_id: row.canonical_asset_id || null,
      canonical_asset_code: row.canonical_asset_code || null,
      canonical_asset_name: row.canonical_asset_name || null,
      evidence_level: row.evidence_level || null,
      exact_plate_support: Boolean(row.exact_plate_support),
      acquisition_date: acquisitionDate,
      useful_life_years: usefulLifeYears,
      life_consumed_pct: lifeConsumedPct,
      depreciation_type: row.depreciation_type || null,
      acquisition_cost: Number(row.acquisition_cost || 0) > 0 ? Number(row.acquisition_cost) : null,
      depreciation_status: Number(row.acquisition_cost || 0) > 0 ? 'cost_available_for_review' : 'blocked_missing_acquisition_cost',
      cost_recovery_status:
        Number(row.acquisition_cost || 0) > 0
          ? 'cost_available'
          : acquisitionDate && invoiceCoverageStart && acquisitionDate < invoiceCoverageStart
            ? 'historical_backfill_required'
            : 'document_lookup_required',
      maintenance_cost: maintenance.cost,
      maintenance_movements: maintenance.movements,
      last_maintenance_cost_date: maintenance.lastCostDate,
    };
  });

  const reconciliationGroups = new Map<string, {
    canonical_asset_id: string;
    canonical_asset_code: string | null;
    canonical_asset_name: string | null;
    candidate_count: number;
    exact_identifier_count: number;
    evidence_levels: Set<string>;
  }>();
  for (const row of fixedAssetQueue) {
    const canonicalAssetId = String(row.canonical_asset_id || '');
    if (!canonicalAssetId) continue;
    const group = reconciliationGroups.get(canonicalAssetId) || {
      canonical_asset_id: canonicalAssetId,
      canonical_asset_code: row.canonical_asset_code ? String(row.canonical_asset_code) : null,
      canonical_asset_name: row.canonical_asset_name ? String(row.canonical_asset_name) : null,
      candidate_count: 0,
      exact_identifier_count: 0,
      evidence_levels: new Set<string>(),
    };
    group.candidate_count += 1;
    if (Boolean(row.exact_plate_support) || Boolean(row.exact_serial_support)) group.exact_identifier_count += 1;
    if (row.evidence_level) group.evidence_levels.add(String(row.evidence_level));
    reconciliationGroups.set(canonicalAssetId, group);
  }
  const assetReconciliationOpportunities = [...reconciliationGroups.values()]
    .map((group) => {
      const maintenance = maintenanceByAsset.get(group.canonical_asset_id) || { cost: 0, movements: 0, lastCostDate: null };
      return {
        canonical_asset_id: group.canonical_asset_id,
        canonical_asset_code: group.canonical_asset_code,
        canonical_asset_name: group.canonical_asset_name,
        candidate_count: group.candidate_count,
        exact_identifier_count: group.exact_identifier_count,
        evidence_levels: [...group.evidence_levels],
        maintenance_cost: maintenance.cost,
        maintenance_movements: maintenance.movements,
        last_maintenance_cost_date: maintenance.lastCostDate,
      };
    })
    .filter((row) => row.maintenance_cost > 0)
    .sort((a, b) => b.maintenance_cost - a.maintenance_cost)
    .slice(0, 10);

  return {
    capability: 'finance',
    sources: [
      'canonical_finance_overview',
      'canonical_finance_cost_centers',
      'canonical_finance_suppliers',
      'procurement_accounts_payable_aging_summary_v1',
      'procurement_cash_forecast_summary_v1',
      'motil_laudus_finance_review_queue',
      'motil_laudus_fixed_asset_review_queue',
      'maintenance_asset_economic_history_v1',
      'laudus_purchase_invoice_payment_status_service_v1',
      'finance_asset_reconciliation_v1',
      'maintenance_cost_by_cost_center_v1',
    ],
    toolsUsed: [
      { name: 'read_finance_overview', mode: 'read' },
      { name: 'read_finance_cost_centers', mode: 'read' },
      { name: 'read_finance_suppliers', mode: 'read' },
      { name: 'read_finance_cash_forecast', mode: 'read' },
      { name: 'read_laudus_finance_review', mode: 'read' },
      { name: 'read_finance_reconciliation', mode: 'read' },
    ],
    payload: {
      freshness: {
        overview_last_event_at: overview.data?.last_event_at || null,
        latest_cost_center_event_at: latestCenterEvent,
        next_due_date: cashForecast.data?.[0]?.next_due_date || null,
        meaning: 'Cada proyección conserva su propia frescura. Una fuente más reciente no actualiza automáticamente las métricas de otra.',
      },
      overview: overview.data || null,
      cost_centers: centers,
      top_suppliers: suppliers.data || [],
      payable_aging: aging.data || [],
      cash_forecast: cashForecast.data || [],
      laudus_review: laudusReview.data || null,
      laudus_aging: laudusAging,
      laudus_supplier_pressure: laudusSupplierPressure,
      asset_economics: assetEconomics,
      asset_reconciliation_opportunities: assetReconciliationOpportunities,
      asset_economics_summary: {
        laudus_assets: Number(fixedAssetPayload.summary?.laudus_assets || 0),
        strong_candidates: assetEconomics.length,
        with_acquisition_cost: assetEconomics.filter((row) => Number(row.acquisition_cost || 0) > 0).length,
        with_maintenance_history: assetEconomics.filter((row) => row.maintenance_cost > 0).length,
        invoice_coverage_start: invoiceCoverageStart,
        historical_backfill_required: assetEconomics.filter((row) => row.cost_recovery_status === 'historical_backfill_required').length,
        document_lookup_required: assetEconomics.filter((row) => row.cost_recovery_status === 'document_lookup_required').length,
        reconciliation_opportunities: assetReconciliationOpportunities.length,
        reconciliation_opportunity_maintenance_cost: assetReconciliationOpportunities.reduce((sum, row) => sum + row.maintenance_cost, 0),
      },
      unresolved_asset_reconciliation: reconciliation.data || [],
      maintenance_cost_by_cost_center: maintenanceCost.data || [],
      semantics: {
        laudus: 'Laudus es fuente financiera trazable. MOTIL prioriza, cruza y explica; no reemplaza la autoridad contable.',
        budget: 'Un presupuesto cero o ausente no debe interpretarse como presupuesto aprobado igual a cero sin validar la fuente contractual/financiera correspondiente.',
        commitments: 'Compromisos de compra son compromisos registrados; no equivalen a gasto reconocido, pagado o devengado salvo evidencia explícita.',
        cash_forecast: 'Forecast contractual basado en CxP y fechas de vencimiento. No es predicción estadística ni probabilidad futura.',
        aging: 'Aging describe antigüedad/vencimiento de saldos abiertos; no prueba pérdida, default ni riesgo crediticio. Para exposición actual Laudus, usa laudus_aging y laudus_supplier_pressure antes que un aging MOTIL vacío.',
        statistical_prediction: 'No declarar predicción estadística, anomalía probabilística ni confianza sin modelo validado, backtesting y control de cambios de régimen.',
        asset_economics: 'Para depreciación o reemplazo, usa asset_economics sólo para identidades fuertes. cost_recovery_status distingue backfill histórico de búsqueda documental. asset_reconciliation_opportunities contiene activos MOTIL con alto costo histórico pero identidad Laudus todavía pendiente; úsalo para priorizar conciliación, no para atribuir depreciación o recomendar reemplazo. No calcules valor libro ni ahorro si falta acquisition_cost.',
        cross_source_freshness: 'No mezclar silenciosamente fechas de corte distintas entre overview, centros de costo, Laudus, compras o mantenimiento.',
      },
    },
  };
}

async function buildEvidence(domain: OperationalAssistantDomain, context: OrganizationSuccessContext) {
  if (domain === 'inventory') return buildInventoryEvidence(context);
  if (domain === 'procurement') return buildProcurementEvidence(context);
  if (domain === 'production') return buildProductionEvidence(context);
  return buildFinanceEvidence(context);
}

function requestedOperationalDomains(capabilities: QueryCapability[], localDomain: OperationalAssistantDomain) {
  const requested = new Set<OperationalAssistantDomain>([localDomain]);
  if (capabilities.includes('inventory')) requested.add('inventory');
  if (capabilities.includes('procurement')) requested.add('procurement');
  if (capabilities.includes('production')) requested.add('production');
  if (capabilities.includes('finance')) requested.add('finance');
  return [...requested];
}

function domainLabel(domain: OperationalAssistantDomain) {
  if (domain === 'inventory') return 'Inventario';
  if (domain === 'procurement') return 'Compras';
  if (domain === 'production') return 'Producción';
  return 'Finanzas';
}

function actionRefusal(domain: OperationalAssistantDomain) {
  return `Puedo preparar y explicar la decisión en ${domainLabel(domain)}, pero este asistente no ejecuta mutaciones operacionales. La acción debe realizarse en el flujo autorizado del módulo y con confirmación humana.`;
}

export async function handleOperationalDomainAssistant(args: { request: NextRequest; context: OrganizationSuccessContext; domain: OperationalAssistantDomain; allowedDomains: OperationalAssistantDomain[]; }) {
  const { request, context, domain } = args;
  if (request.method === 'GET') {
    return NextResponse.json({ conversation: null, messages: [], hasMore: false, oldestMessageAt: null, sessionIdleHours: null, memoryCount: 0, cargo: null, persistence: 'stateless_v1' });
  }
  const body = await request.json().catch(() => null);
  if (body?.action === 'archive') return NextResponse.json({ archived: false, conversationId: null });
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if (!message) return NextResponse.json({ error: 'Escribe una consulta operacional.' }, { status: 400 });
  if (message.length > MAX_MESSAGE_CHARS) return NextResponse.json({ error: 'La consulta es demasiado extensa.' }, { status: 400 });
  const route = routeOperationalQuery(message, { domain });
  if (route.requiresExplicitAuthorization || route.mode === 'action') {
    return NextResponse.json({ answer: actionRefusal(domain), model: null, sources: [], toolsUsed: [], conversationId: null, route, policy: 'READ_ONLY: ninguna mutación se ejecuta desde este runtime conversacional.' });
  }
  try {
    const [skillRuntime, skillPlan] = await Promise.all([
      resolveMotilSkillAvailability(
        context,
        args.allowedDomains.filter((item): item is 'inventory' | 'procurement' | 'finance' =>
          item === 'inventory' || item === 'procurement' || item === 'finance',
        ),
      ),
      Promise.resolve(buildSkillPlan(message)),
    ]);
    const skillState = new Map(skillRuntime.skills.map((skill) => [skill.key, skill]));
    const plannedSkills = skillPlan
      ? [skillPlan.primary, ...skillPlan.supporting].map((skill) => {
          const availability = skillState.get(skill.key);
          return {
            key: skill.key,
            name: skill.name,
            domain: skill.domain,
            state: availability?.state || 'dormant',
            missingEvidence: availability?.missingEvidence || [],
            missingSyncedData: availability?.missingSyncedData || [],
          };
        })
      : [];

    const desired = requestedOperationalDomains(route.capabilities, domain);
    const permitted = desired.filter((item) => args.allowedDomains.includes(item));
    const denied = desired.filter((item) => !args.allowedDomains.includes(item));
    const bundles = await Promise.all(permitted.map((item) => buildEvidence(item, context)));
    const sources = Array.from(new Set(bundles.flatMap((bundle) => bundle.sources)));
    const toolsUsed = bundles.flatMap((bundle) => bundle.toolsUsed);
    const evidence = Object.fromEntries(bundles.map((bundle) => [bundle.capability, bundle.payload]));
    const localLabel = domainLabel(domain);
    const instructions = `Eres el especialista de ${localLabel} dentro de MOTIL Intelligence Core para una operación minera chilena. Tu arquitectura es contexto local primero y expansión transversal sólo cuando aporta evidencia útil.\n\nREGLAS OBLIGATORIAS:\n1. Usa exclusivamente la evidencia canónica incluida en EVIDENCIA MOTIL para afirmaciones operacionales.\n2. Distingue DATO CANÓNICO, INTERPRETACIÓN PROFESIONAL, HIPÓTESIS A REVISAR y SIGUIENTE ACCIÓN cuando corresponda.\n3. Si el usuario pregunta por hoy, ahora o estado actual, declara explícitamente la fecha de frescura disponible. No presentes un snapshot antiguo como tiempo real.\n4. Un stock en reorder/out_of_stock/negative no es por sí solo criticidad operacional, riesgo de falla ni prioridad de compra.\n5. Un estado de orden de compra no autoriza inferir recepción, entrega, pago o cierre si esos hechos no están en la evidencia.\n6. En Producción separa valores reportados por fuente de cálculos determinísticos, respeta fine_coverage_state y no conviertas balances, frecuencias o excepciones en causas raíz o pronósticos.\n7. En Finanzas conserva la fecha de corte de cada proyección; no combines silenciosamente fuentes con distinta frescura. No interpretes presupuesto cero/ausente como presupuesto aprobado igual a cero. No confundas compromiso, gasto reconocido, devengo ni pago.\n8. No inventes precios vigentes, proveedores, lead times, criticidades, repuestos equivalentes, costos, causas, disponibilidad, tonelajes, leyes, recuperaciones, presupuestos ni producción faltante.\n9. Si falta permiso para una capacidad transversal solicitada, dilo de forma breve y limita la conclusión a la evidencia autorizada.\n10. No ejecutes compras, reservas, ajustes de stock, recepciones, aprobaciones, cambios de plan, cierres, pagos ni otra mutación. Puedes preparar una recomendación para validación humana.\n11. Mantén la respuesta operacional, concreta y breve. Prioriza qué sabemos, qué excepción importa, qué falta confirmar y cuál es el siguiente paso de mayor valor.\n12. No expongas JSON crudo ni detalles internos del runtime.
13. PLAN DE SKILLS es orientación interna, no una fuente. Una skill AVAILABLE puede orientar qué evidencia combinar, pero la afirmación final debe seguir respaldada por EVIDENCIA MOTIL.
14. Una skill DEGRADED sólo puede usarse para explicar qué información falta; no la presentes como capacidad completa ni extraigas una conclusión positiva de ella.
15. Una skill DORMANT no debe usarse, nombrarse como disponible ni insinuarse. Si la pregunta depende de ella, explica brevemente que faltan datos sincronizados.
16. Nunca amplíes evidencia o permisos sólo porque una skill lo sugiera.
17. En Finanzas, Laudus sigue siendo la fuente financiera trazable. MOTIL añade dashboard, priorización, forecast, contexto y explicación; no presentes a MOTIL como reemplazo contable.
18. Un forecast basado en CxP y due_date es forecast contractual. No lo llames predicción estadística, IA predictiva ni confianza probabilística.
19. Si el usuario pregunta qué viene, usa cash_forecast y aging. Si pregunta qué se sale del patrón, sólo describe concentraciones, excepciones o faltantes observados salvo que exista un modelo estadístico validado.
20. Para el gerente de Finanzas, cuando la pregunta sea general responde máximo 3 asuntos en formato MONTO/HECHO → POR QUÉ IMPORTA → EVIDENCIA/FUENTE → SIGUIENTE VALIDACIÓN HUMANA.`;
    const input = `RUTA DE CONSULTA\n${JSON.stringify(route)}\n\nPLAN DE SKILLS NO CANÓNICO\n${JSON.stringify(plannedSkills)}\n\nCAPACIDADES SIN PERMISO\n${JSON.stringify(denied)}\n\nEVIDENCIA MOTIL\n${JSON.stringify(evidence)}\n\nPREGUNTA\n${message}`;
    const result = await callOpenAI({ instructions, input });
    return NextResponse.json({
      answer: result.text,
      model: result.model,
      responseId: result.responseId,
      sources,
      toolsUsed,
      conversationId: null,
      route,
      deniedCapabilities: denied,
      skillPlan: plannedSkills,
      skillSummary: skillRuntime.summary,
      persistence: 'stateless_v1',
      policy: 'READ_ONLY: evidencia canónica → interpretación → hipótesis → siguiente acción humana. Skills orientan composición; nunca sustituyen evidencia ni permisos.',
    });
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error ?? 'unknown');
    const configurationError = detail.includes('OPENAI_API_KEY');
    console.error('[operational-domain-assistant] request failed', { domain, detail });
    return NextResponse.json({ error: configurationError ? 'El servicio de IA no está configurado en este entorno.' : 'No fue posible consultar la evidencia operacional.' }, { status: configurationError ? 503 : 500 });
  }
}
