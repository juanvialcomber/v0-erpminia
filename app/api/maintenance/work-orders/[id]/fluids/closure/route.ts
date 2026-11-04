export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

type ClosurePayload = {
  fluids_used?: boolean;
  waste_status?: 'linked' | 'none_recovered' | 'not_applicable';
  note?: string | null;
};

async function readClosureEvidence(context: Awaited<ReturnType<typeof getOrganizationContext>>, workOrderId: string) {
  if (!context.ok) return null;

  const [{ data: usages, error: usageError }, { data: events, error: eventError }] = await Promise.all([
    context.supabase
      .from('maintenance_fluid_usage_records')
      .select('id,fluid_name,quantity_liters,total_cost,cost_state,warehouse_code,used_at,created_by')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', workOrderId)
      .order('used_at', { ascending: true }),
    context.supabase
      .from('work_order_events')
      .select('id,event_type,event_at,actor_id,actor_name,payload,created_at')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', workOrderId)
      .in('event_type', ['waste_generated', 'fluid_closure_declared'])
      .order('event_at', { ascending: false })
      .limit(500),
  ]);
  if (usageError) throw usageError;
  if (eventError) throw eventError;

  const declaration = (events || []).find((event) => event.event_type === 'fluid_closure_declared') || null;
  const wasteEvents = (events || []).filter(
    (event) => event.event_type === 'waste_generated' && Boolean((event.payload as any)?.source_fluid_usage_id),
  );
  const linkedUsageIds = new Set(wasteEvents.map((event) => String((event.payload as any)?.source_fluid_usage_id || '')));
  const usageRows = (usages || []).map((usage) => ({
    ...usage,
    linked_waste: linkedUsageIds.has(String(usage.id)),
  }));

  return {
    declaration,
    usages: usageRows,
    usageCount: usageRows.length,
    linkedWasteCount: usageRows.filter((usage) => usage.linked_waste).length,
  };
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

  const assigned = await requireAssignedMaintenanceExecution(context, id);
  if (!assigned.ok) {
    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    if (accessLevel !== 'ED') return assigned.response;
  }

  try {
    const evidence = await readClosureEvidence(context, id);
    return NextResponse.json({ ...evidence, canDeclare: assigned.ok });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar la declaración de fluidos.' },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

  const assigned = await requireAssignedMaintenanceExecution(context, id);
  if (!assigned.ok) return assigned.response;

  const body = (await request.json().catch(() => null)) as ClosurePayload | null;
  if (!body || typeof body.fluids_used !== 'boolean') {
    return NextResponse.json({ error: 'Debes indicar si se utilizaron aceites o fluidos en esta OT.' }, { status: 400 });
  }

  const wasteStatus = body.waste_status;
  if (!wasteStatus || !['linked', 'none_recovered', 'not_applicable'].includes(wasteStatus)) {
    return NextResponse.json({ error: 'Debes indicar qué ocurrió con el residuo de los fluidos.' }, { status: 400 });
  }

  try {
    const evidence = await readClosureEvidence(context, id);
    const usageCount = evidence?.usageCount || 0;
    const linkedWasteCount = evidence?.linkedWasteCount || 0;

    if (body.fluids_used && usageCount < 1) {
      return NextResponse.json(
        { error: 'Registraste uso de fluidos. Agrega al menos un aceite o fluido utilizado antes de confirmar el cierre.' },
        { status: 409 },
      );
    }
    if (!body.fluids_used && usageCount > 0) {
      return NextResponse.json(
        { error: 'Esta OT ya tiene fluidos registrados. Confirma que sí se utilizaron fluidos.' },
        { status: 409 },
      );
    }
    if (!body.fluids_used && wasteStatus !== 'not_applicable') {
      return NextResponse.json(
        { error: 'Si no se utilizaron fluidos, el residuo debe quedar como No aplica.' },
        { status: 400 },
      );
    }
    if (body.fluids_used && wasteStatus === 'not_applicable') {
      return NextResponse.json(
        { error: 'Si se utilizaron fluidos, confirma si hubo residuo recuperado o si no se recuperó.' },
        { status: 400 },
      );
    }
    if (body.fluids_used && wasteStatus === 'linked' && linkedWasteCount < 1) {
      return NextResponse.json(
        { error: 'Indicaste residuo recuperado. Registra el residuo desde Lubricación antes de confirmar.' },
        { status: 409 },
      );
    }

    const { data: order, error: orderError } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,canonical_asset_id,work_order_number')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .single();
    if (orderError) throw orderError;

    const now = new Date().toISOString();
    const payload = {
      fluids_used: body.fluids_used,
      waste_status: wasteStatus,
      fluid_usage_count: usageCount,
      linked_waste_count: linkedWasteCount,
      note: String(body.note || '').trim() || null,
      declared_by_assigned_executor: true,
      declaration_version: 'v1',
    };

    const { data: event, error: eventError } = await context.supabase
      .from('work_order_events')
      .insert({
        organization_id: context.organizationId,
        work_order_id: id,
        canonical_asset_id: order.canonical_asset_id,
        event_type: 'fluid_closure_declared',
        event_at: now,
        actor_id: context.userId,
        actor_name: context.userName || context.userEmail || null,
        source_table: 'maintenance_fluid_usage_records',
        source_record_id: id,
        summary: body.fluids_used
          ? 'Mecánico confirmó aceites/fluidos y estado de residuos para cierre'
          : 'Mecánico confirmó que no se utilizaron aceites/fluidos en la OT',
        payload,
      })
      .select('id,event_type,event_at,actor_id,actor_name,payload')
      .single();
    if (eventError) throw eventError;

    return NextResponse.json({ declaration: event, ...payload });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo guardar la declaración de fluidos.' },
      { status: 500 },
    );
  }
}
