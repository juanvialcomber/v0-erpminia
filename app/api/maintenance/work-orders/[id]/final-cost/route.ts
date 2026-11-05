export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getMaintenanceActorAuthority } from '@/lib/maintenance/work-order-authority';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  const authority = await getMaintenanceActorAuthority(context);
  const assigned = await requireAssignedMaintenanceExecution(context, id);
  if (!authority.canReadAllWorkOrders && !assigned.ok) return assigned.response;

  try {
    const [{ data: cost, error: costError }, { data: snapshots, error: snapshotError }] = await Promise.all([
      context.supabase
        .from('work_order_final_cost_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .maybeSingle(),
      context.supabase
        .from('work_order_closure_cost_snapshots')
        .select('closure_sequence,canonical_asset_id,cost_center_id,parts_cost,labor_cost,effective_external_cost,procurement_received_cost,procurement_currency,procurement_currency_count,total_cost,external_cost_basis,closed_at')
        .eq('organization_id', context.organizationId)
        .eq('work_order_id', id)
        .order('closure_sequence', { ascending: false })
        .limit(1),
    ]);
    if (costError) throw costError;
    if (snapshotError) throw snapshotError;
    if (!cost) return NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 });
    return NextResponse.json({ data: cost, latestSnapshot: snapshots?.[0] || null });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el costo final de la orden';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
