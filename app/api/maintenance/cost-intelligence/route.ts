export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_GERENCIAL);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [summaryResult, costEvidenceResult, assetsResult, centersResult, typesResult, causesResult] = await Promise.all([
      context.supabase
        .from('maintenance_cost_intelligence_summary_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .maybeSingle(),
      context.supabase
        .from('maintenance_cost_intelligence_base_v1')
        .select('work_order_id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .or('parts_cost.gt.0,labor_cost.gt.0,external_cost.gt.0,procurement_received_cost.gt.0'),
      context.supabase
        .from('maintenance_cost_by_asset_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('total_cost', { ascending: false })
        .limit(20),
      context.supabase
        .from('maintenance_cost_by_cost_center_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('total_cost', { ascending: false })
        .limit(20),
      context.supabase
        .from('maintenance_cost_by_work_type_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('total_cost', { ascending: false })
        .limit(20),
      context.supabase
        .from('maintenance_cost_by_root_cause_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('total_cost', { ascending: false })
        .limit(20),
    ]);

    const firstError = summaryResult.error || costEvidenceResult.error || assetsResult.error || centersResult.error || typesResult.error || causesResult.error;
    if (firstError) throw firstError;

    const baseSummary = summaryResult.data || {
        completed_work_orders: 0,
        audited_work_orders: 0,
        completed_without_snapshot: 0,
        audited_coverage_percent: null,
        audited_total_cost: 0,
        parts_cost: 0,
        labor_cost: 0,
        external_cost: 0,
      };
    const auditedWorkOrders = Number(baseSummary.audited_work_orders || 0);
    const costEvidenceWorkOrders = Number(costEvidenceResult.count || 0);
    const zeroCostSnapshots = Math.max(0, auditedWorkOrders - costEvidenceWorkOrders);
    const costEvidenceCoveragePercent = auditedWorkOrders > 0 ? Math.round((costEvidenceWorkOrders / auditedWorkOrders) * 1000) / 10 : null;

    return NextResponse.json({
      summary: {
        ...baseSummary,
        cost_evidence_work_orders: costEvidenceWorkOrders,
        zero_cost_snapshots: zeroCostSnapshots,
        cost_evidence_coverage_percent: costEvidenceCoveragePercent,
        cost_state: auditedWorkOrders === 0
          ? 'no_snapshots'
          : costEvidenceWorkOrders === 0
            ? 'snapshots_without_cost_evidence'
            : costEvidenceWorkOrders < auditedWorkOrders
              ? 'partial_cost_evidence'
              : 'cost_evidence_available',
      },
        completed_work_orders: 0,
        audited_work_orders: 0,
        completed_without_snapshot: 0,
        audited_coverage_percent: null,
        audited_total_cost: 0,
        parts_cost: 0,
        labor_cost: 0,
        external_cost: 0,
      },
      byAsset: assetsResult.data || [],
      byCostCenter: centersResult.data || [],
      byWorkType: typesResult.data || [],
      byRootCause: causesResult.data || [],
      source: 'work_order_closure_cost_snapshots',
      canonical: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la inteligencia de costos de mantenimiento';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
