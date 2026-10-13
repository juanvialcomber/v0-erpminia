export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderScope, requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

type ExecutionPayload = {
  action?: 'install_part' | 'return_part' | 'add_labor' | 'add_external_service';
  workOrderPartId?: string;
  quantity?: number;
  technicianId?: string | null;
  technicianName?: string;
  hours?: number;
  hourlyCost?: number;
  notes?: string | null;
  providerName?: string;
  serviceDescription?: string;
  documentNumber?: string | null;
  serviceDate?: string;
  amount?: number;
  serviceStatus?: 'pending' | 'approved' | 'completed';
};

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const scope = await getMaintenanceWorkOrderScope(context.supabase, context.organizationId, id);
    if (scope === 'missing') return NextResponse.json({ error: 'La orden no existe' }, { status: 404 });

    const [orderResult, partsResult, laborResult, servicesResult, eventsResult, costsResult, snapshotResult, materialsResult, approvalResult] = await Promise.all([
      context.supabase.from('maintenance_work_orders').select('id, work_order_number, title, description, status, assigned_to_name, scheduled_date, start_date, completion_date, actual_duration_hours, down_time_hours, root_cause, preventive_actions').eq('organization_id', context.organizationId).eq('id', id).maybeSingle(),
      context.supabase.from('work_order_parts').select('*, stock:warehouse_stock(id, part_code, part_name, unit_cost)').eq('organization_id', context.organizationId).eq('work_order_id', id).order('created_at', { ascending: false }),
      context.supabase.from('work_order_labor_entries').select('*').eq('organization_id', context.organizationId).eq('work_order_id', id).order('created_at', { ascending: false }),
      context.supabase.from('work_order_external_services').select('*').eq('organization_id', context.organizationId).eq('work_order_id', id).order('service_date', { ascending: false }),
      context.supabase.from('work_order_events').select('*').eq('organization_id', context.organizationId).eq('work_order_id', id).order('event_at', { ascending: false }).limit(100),
      context.supabase.from('work_order_final_cost_v1').select('*').eq('organization_id', context.organizationId).eq('work_order_id', id).maybeSingle(),
      context.supabase.from('work_order_closure_cost_snapshots').select('closure_sequence,parts_cost,labor_cost,effective_external_cost,procurement_received_cost,procurement_currency,procurement_currency_count,total_cost,external_cost_basis,closed_at').eq('organization_id', context.organizationId).eq('work_order_id', id).order('closure_sequence', { ascending: false }).limit(1),
      context.supabase.from('work_order_material_requirements').select('id,canonical_product_id,quantity_required,quantity_available,quantity_shortage,status,notes').eq('organization_id', context.organizationId).eq('work_order_id', id),
      context.supabase.from('work_order_supervisor_reviews').select('id,status,reviewed_by_name,reviewed_at,decision_note').eq('organization_id',context.organizationId).eq('work_order_id',id).order('reviewed_at',{ascending:false}).limit(1),
    ]);

    const firstError = orderResult.error || partsResult.error || laborResult.error || servicesResult.error || eventsResult.error || costsResult.error || snapshotResult.error || materialsResult.error || approvalResult.error;
    if (firstError) throw firstError;
    if (!orderResult.data) return NextResponse.json({ error: 'La orden no existe' }, { status: 404 });

    const productIds = Array.from(new Set((materialsResult.data || []).map(row => row.canonical_product_id).filter((id): id is string => Boolean(id))));
    const { data: materialProducts, error: materialProductsError } = productIds.length
      ? await context.supabase.from('canonical_products_v1').select('id,product_code,name,unit').eq('organization_id',context.organizationId).in('id',productIds)
      : { data: [], error: null };
    if (materialProductsError) throw materialProductsError;
    const materialNames = new Map((materialProducts || []).map(row => [row.id, row]));
    const enrichedMaterials = (materialsResult.data || []).map(row => ({ ...row, product: row.canonical_product_id ? materialNames.get(row.canonical_product_id) || null : null }));

    const { data: workers, error: workersError } = await context.supabase
      .from('people')
      .select('id,full_name,role_title,profile_id,employment_status')
      .eq('organization_id', context.organizationId)
      .eq('employment_status', 'active')
      .order('full_name');
    if (workersError) throw workersError;

    const cost = costsResult.data;
    const costs = cost ? { ...cost, external_cost: cost.effective_external_cost, latest_snapshot: snapshotResult.data?.[0] || null } : {
      parts_cost: 0,
      labor_cost: 0,
      external_cost: 0,
      total_cost: 0,
      procurement_received_cost: 0,
      procurement_currency: null,
      procurement_currency_count: 0,
      open_procurement_orders: 0,
      pending_parts: 0,
      open_labor_entries: 0,
      pending_external_services: 0,
      unmet_material_requirements: 0,
      external_cost_conflict: false,
      operationally_ready_to_close: false,
      latest_snapshot: snapshotResult.data?.[0] || null,
    };

    return NextResponse.json({
      workOrder: orderResult.data,
      parts: partsResult.data || [],
      materialRequirements: enrichedMaterials,
      supervisorReview: approvalResult.data?.[0] || null,
      labor: laborResult.data || [],
      workers: workers || [],
      externalServices: servicesResult.data || [],
      events: eventsResult.data || [],
      costs,
      canEdit: access.canWrite && scope === 'operational',
      record_scope: scope,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la ejecución de la orden';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });

    const body = (await request.json()) as ExecutionPayload;

    if (body.action === 'install_part' || body.action === 'return_part') {
      if (!body.workOrderPartId || !body.quantity || body.quantity <= 0) return NextResponse.json({ error: 'Repuesto y cantidad son obligatorios' }, { status: 400 });
      const functionName = body.action === 'install_part' ? 'install_work_order_part' : 'return_work_order_part';
      const { data, error } = await context.supabase.rpc(functionName, {
        p_organization_id: context.organizationId,
        p_work_order_part_id: body.workOrderPartId,
        p_quantity: body.quantity,
        p_actor_id: context.userId,
        p_actor_name: null,
        p_notes: body.notes || null,
      });
      if (error) throw error;
      return NextResponse.json({ data });
    }

    if (body.action === 'add_labor') {
      if (!body.technicianId || !body.hours || body.hours <= 0) return NextResponse.json({ error: 'Persona y horas son obligatorias' }, { status: 400 });
      const { data: worker, error: workerError } = await context.supabase
        .from('people')
        .select('id,full_name,employment_status')
        .eq('organization_id', context.organizationId)
        .eq('id', body.technicianId)
        .eq('employment_status', 'active')
        .maybeSingle();
      if (workerError) throw workerError;
      if (!worker) return NextResponse.json({ error: 'La persona seleccionada no está activa en el maestro de personas.' }, { status: 400 });
      const { data, error } = await context.supabase.rpc('add_work_order_labor', {
        p_organization_id: context.organizationId,
        p_work_order_id: id,
        p_technician_id: worker.id,
        p_technician_name: worker.full_name,
        p_hours: body.hours,
        p_hourly_cost: Math.max(0, Number(body.hourlyCost || 0)),
        p_notes: body.notes || null,
        p_actor_id: context.userId,
      });
      if (error) throw error;
      return NextResponse.json({ data }, { status: 201 });
    }

    if (body.action === 'add_external_service') {
      const amount = Number(body.amount || 0);
      if (!body.providerName?.trim() || !body.serviceDescription?.trim() || !Number.isFinite(amount) || amount < 0) return NextResponse.json({ error: 'Proveedor, servicio y monto válido son obligatorios' }, { status: 400 });

      const { data, error } = await context.supabase.from('work_order_external_services').insert({
        organization_id: context.organizationId,
        work_order_id: id,
        provider_name: body.providerName.trim(),
        service_description: body.serviceDescription.trim(),
        document_number: body.documentNumber?.trim() || null,
        service_date: body.serviceDate || new Date().toISOString().slice(0, 10),
        amount,
        status: body.serviceStatus || 'approved',
        notes: body.notes || null,
        created_by: context.userId,
      }).select('*').single();
      if (error) throw error;
      return NextResponse.json({ data }, { status: 201 });
    }

    return NextResponse.json({ error: 'Acción no soportada' }, { status: 400 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo registrar la ejecución de la orden';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
