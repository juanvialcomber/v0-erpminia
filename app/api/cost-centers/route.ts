import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { isActiveCostCenterStatus } from '@/lib/cost-centers';
import { orgHasCanonicalData } from '@/lib/api/canonical';

export const dynamic = 'force-dynamic';

type CostCenterRow = {
  id: string;
  code: string | null;
  name: string | null;
  description: string | null;
  status: string | null;
};

type CanonicalCostCenterRow = {
  id: string;
  cost_center_code: string | null;
  name: string | null;
  full_path: string | null;
  center_type: string | null;
  is_active: boolean | null;
};

type CostCenterResponse = {
  id: string;
  code: string;
  name: string;
  description: string | null;
  status: 'active' | 'inactive';
  activityEvents?: number;
  committedClp?: number;
};

export async function GET(request: NextRequest) {
  try {
    const context = await getOrganizationContext(request);
    if (!context.ok) return context.response;

    // Real org reads authoritative cost centers from the canonical view.
    if (orgHasCanonicalData(context.organizationId)) {
      const [{ data, error }, { data: financeActivity, error: financeActivityError }] = await Promise.all([
        context.supabase
          .from('canonical_cost_centers_current')
          .select('id, cost_center_code, name, full_path, center_type, is_active')
          .eq('organization_id', context.organizationId)
          .order('cost_center_code'),
        context.supabase
          .from('canonical_finance_cost_centers')
          .select('cost_center_code,event_count,committed_clp')
          .eq('organization_id', context.organizationId),
      ]);

      if (financeActivityError) {
        console.error('[API] Cost center finance activity fetch error:', financeActivityError);
      }

      if (!error && Array.isArray(data) && data.length > 0) {
        const activityByCode = new Map(
          (Array.isArray(financeActivity) ? financeActivity : []).map((row: any) => [
            String(row.cost_center_code || '').trim(),
            {
              activityEvents: Number(row.event_count || 0),
              committedClp: Number(row.committed_clp || 0),
            },
          ]),
        );
        const normalized = (data as CanonicalCostCenterRow[])
          .filter((center) => Boolean(center.id && center.cost_center_code && center.name))
          .filter((center) => center.is_active !== false)
          .map<CostCenterResponse>((center) => ({
            id: center.id,
            code: String(center.cost_center_code || '').trim(),
            name: String(center.name || '').trim(),
            description: center.full_path || center.center_type || null,
            status: 'active',
            activityEvents: activityByCode.get(String(center.cost_center_code || '').trim())?.activityEvents || 0,
            committedClp: activityByCode.get(String(center.cost_center_code || '').trim())?.committedClp || 0,
          }));

        return NextResponse.json(normalized);
      }
    }

    // Operational fallback (demo org and any org without canonical data).
    const { data: costCenters, error } = await context.supabase
      .from('cost_centers')
      .select('id, code, name, description, status')
      .eq('organization_id', context.organizationId)
      .order('code');

    if (error) {
      console.error('[API] Cost centers fetch error:', error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const normalized = (Array.isArray(costCenters) ? (costCenters as CostCenterRow[]) : [])
      .filter((center) => Boolean(center.id && center.code && center.name))
      .filter((center) => isActiveCostCenterStatus(center.status))
      .map<CostCenterResponse>((center) => ({
        id: center.id,
        code: String(center.code || '').trim(),
        name: String(center.name || '').trim(),
        description: center.description || null,
        status: 'active',
      }));

    return NextResponse.json(normalized);
  } catch (error) {
    console.error('[API] Unexpected error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
