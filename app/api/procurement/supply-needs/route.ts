export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data, error } = await context.supabase
      .schema('intelligence')
      .from('work_order_supply_status')
      .select('*')
      .eq('organization_id', context.organizationId)
      .in('supply_status', ['open', 'pending', 'ready_for_procurement'])
      .gt('shortage_lines', 0)
      .order('required_date', { ascending: true, nullsFirst: false });

    if (error) throw error;

    const rows = data || [];
    const workOrderIds = rows.map((row: any) => row.work_order_id).filter(Boolean);
    const { data: workOrders, error: workOrdersError } = workOrderIds.length
      ? await context.supabase
          .from('maintenance_work_orders')
          .select('id,status,closed_at')
          .eq('organization_id', context.organizationId)
          .in('id', workOrderIds)
      : { data: [], error: null };
    if (workOrdersError) throw workOrdersError;

    const statusById = new Map((workOrders || []).map((row: any) => [String(row.id), row]));
    const inactiveStatuses = new Set(['completed', 'closed', 'cancelled']);
    const needs = rows.filter((row: any) => {
      const workOrder = statusById.get(String(row.work_order_id || ''));
      return workOrder && !inactiveStatuses.has(String(workOrder.status || '').toLowerCase()) && !workOrder.closed_at;
    });
    const historicalDebt = rows.filter((row: any) => {
      const workOrder = statusById.get(String(row.work_order_id || ''));
      return !workOrder || inactiveStatuses.has(String(workOrder.status || '').toLowerCase()) || Boolean(workOrder.closed_at);
    });

    return NextResponse.json({
      needs,
      historicalDebt,
      semantics: 'only active maintenance work orders can be converted into procurement intake; closed shortages remain historical data-quality debt',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudieron cargar las necesidades de abastecimiento';
    return NextResponse.json({ needs: [], error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = (await request.json()) as { supplyNeedId?: string };
    if (!body.supplyNeedId) {
      return NextResponse.json({ error: 'Falta la necesidad de abastecimiento' }, { status: 400 });
    }

    const { data: userData } = await context.supabase.auth.getUser();
    const requestedByName = userData.user?.user_metadata?.full_name
      || userData.user?.user_metadata?.name
      || userData.user?.email
      || null;

    const { data, error } = await context.supabase.rpc('convert_supply_need_to_intake_request', {
      p_supply_need_id: body.supplyNeedId,
      p_requested_by: context.userId,
      p_requested_by_name: requestedByName,
    });

    if (error) throw error;

    const { data: intake, error: intakeError } = await context.supabase
      .from('procurement_intake_flow')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('id', data)
      .single();

    if (intakeError) throw intakeError;

    return NextResponse.json({ intake }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo crear la solicitud operativa';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
