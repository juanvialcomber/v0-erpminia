export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const organizationId = context.organizationId;
    const [overview, assets, products, suppliers, costCenters, validation, recent, alerts, operationalProcurement, operationalEvents, treasury, treasuryAging, cashForecast, laudusReview, laudusOpenPage1, laudusOpenPage2] = await Promise.all([
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

    const error = overview.error || assets.error || products.error || suppliers.error || costCenters.error || validation.error || recent.error || alerts.error || operationalProcurement.error || operationalEvents.error || treasury.error || treasuryAging.error || cashForecast.error || laudusReview.error || laudusOpenPage1.error || laudusOpenPage2.error;
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
