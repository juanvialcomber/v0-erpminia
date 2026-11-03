export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

const allowedWasteCodes = new Set([
  'used_oil',
  'hydraulic_fluid',
  'coolant',
  'brake_fluid',
  'contaminated_fuel',
  'used_filter',
  'contaminated_absorbent',
  'battery',
  'tire',
  'contaminated_container',
  'scrap_metal',
  'common_waste',
  'other',
]);

const allowedClassifications = new Set(['hazardous','non_hazardous','to_classify']);
const allowedUnits = new Set(['L','kg','unit']);
const allowedStatuses = new Set(['generated','stored','removed','closed']);

type WastePayload = {
  waste_id?: string;
  waste_code?: string;
  waste_name?: string;
  classification?: string;
  quantity?: number | string;
  unit?: string;
  container_code?: string | null;
  storage_location?: string | null;
  notes?: string | null;
  status?: string;
  transporter_name?: string | null;
  transporter_identifier?: string | null;
  destination_name?: string | null;
  transfer_document_ref?: string | null;
};

async function canWriteWaste(context: Awaited<ReturnType<typeof getOrganizationContext>> & { ok: true }, workOrderId: string) {
  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level === 'ED') return true;
  const execution = await requireAssignedMaintenanceExecution(context, workOrderId);
  return execution.ok;
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const { data: order } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,created_by')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .maybeSingle();
    if (!order) return NextResponse.json({ error: 'No se encontró la OT' }, { status: 404 });

    const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
    const execution = await requireAssignedMaintenanceExecution(context, id);
    if (level !== 'ED' && level !== 'LEC' && !execution.ok) {
      return NextResponse.json({ error: 'No tienes acceso a los residuos de esta OT.' }, { status: 403 });
    }

    const { data, error } = await context.supabase
      .from('maintenance_waste_records')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .order('generated_at', { ascending: false });
    if (error) throw error;

    return NextResponse.json({
      data: data || [],
      canEdit: Boolean(order.created_by) && (level === 'ED' || execution.ok),
      complianceCertified: false,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar los residuos.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });
    if (!(await canWriteWaste(context, id))) return NextResponse.json({ error: 'No autorizado para registrar residuos en esta OT.' }, { status: 403 });

    const body = (await request.json()) as WastePayload;
    const wasteCode = String(body.waste_code || '').trim();
    const wasteName = String(body.waste_name || '').trim();
    const classification = String(body.classification || 'to_classify').trim();
    const unit = String(body.unit || '').trim();
    const quantity = Number(body.quantity);

    if (!allowedWasteCodes.has(wasteCode)) return NextResponse.json({ error: 'Tipo de residuo no válido.' }, { status: 400 });
    if (!wasteName) return NextResponse.json({ error: 'Indica el residuo generado.' }, { status: 400 });
    if (!allowedClassifications.has(classification)) return NextResponse.json({ error: 'Clasificación no válida.' }, { status: 400 });
    if (!allowedUnits.has(unit)) return NextResponse.json({ error: 'Unidad no válida.' }, { status: 400 });
    if (!Number.isFinite(quantity) || quantity <= 0) return NextResponse.json({ error: 'La cantidad debe ser mayor que cero.' }, { status: 400 });

    const { data: order, error: orderError } = await context.supabase
      .from('maintenance_work_orders')
      .select('canonical_asset_id,asset_id')
      .eq('organization_id', context.organizationId)
      .eq('id', id)
      .single();
    if (orderError) throw orderError;

    const { data, error } = await context.supabase
      .from('maintenance_waste_records')
      .insert({
        organization_id: context.organizationId,
        work_order_id: id,
        canonical_asset_id: order.canonical_asset_id || order.asset_id || null,
        waste_code: wasteCode,
        waste_name: wasteName,
        classification,
        quantity,
        unit,
        container_code: body.container_code ? String(body.container_code).trim() : null,
        storage_location: body.storage_location ? String(body.storage_location).trim() : null,
        notes: body.notes ? String(body.notes).trim() : null,
        status: 'generated',
        created_by: context.authUserId,
        updated_by: context.authUserId,
      })
      .select('*')
      .single();
    if (error) throw error;

    await context.supabase.from('work_order_events').insert({
      organization_id: context.organizationId,
      work_order_id: id,
      canonical_asset_id: order.canonical_asset_id || order.asset_id || null,
      event_type: 'waste_generated',
      event_at: new Date().toISOString(),
      actor_id: context.authUserId,
      actor_name: context.userName || context.userEmail || null,
      source_table: 'maintenance_waste_records',
      source_record_id: data.id,
      summary: 'Residuo de mantención registrado',
      payload: { waste_code: wasteCode, quantity, unit, classification },
    });

    return NextResponse.json({ data, complianceCertified: false }, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo registrar el residuo.' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  try {
    const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
    if (!guard.ok) return NextResponse.json({ error: guard.error, record_scope: guard.scope }, { status: guard.status });
    if (!(await canWriteWaste(context, id))) return NextResponse.json({ error: 'No autorizado para actualizar residuos en esta OT.' }, { status: 403 });

    const body = (await request.json()) as WastePayload;
    const wasteId = String(body.waste_id || '').trim();
    const status = String(body.status || '').trim();
    if (!wasteId) return NextResponse.json({ error: 'Falta el residuo a actualizar.' }, { status: 400 });
    if (!allowedStatuses.has(status)) return NextResponse.json({ error: 'Estado de residuo no válido.' }, { status: 400 });

    const { data: current, error: currentError } = await context.supabase
      .from('maintenance_waste_records')
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .eq('id', wasteId)
      .single();
    if (currentError) return NextResponse.json({ error: 'No se encontró el residuo.' }, { status: 404 });

    const order = ['generated','stored','removed','closed'];
    if (order.indexOf(status) < order.indexOf(current.status)) {
      return NextResponse.json({ error: 'El estado del residuo no puede retroceder.' }, { status: 409 });
    }
    if ((status === 'stored' || status === 'removed' || status === 'closed') && !String(body.storage_location || current.storage_location || '').trim()) {
      return NextResponse.json({ error: 'Registra la ubicación de almacenamiento antes de continuar.' }, { status: 400 });
    }
    if ((status === 'removed' || status === 'closed') && !String(body.destination_name || current.destination_name || '').trim()) {
      return NextResponse.json({ error: 'Registra el destino del retiro antes de continuar.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    const updateData: Record<string, unknown> = {
      status,
      updated_by: context.authUserId,
      updated_at: now,
    };
    if (body.container_code !== undefined) updateData.container_code = body.container_code ? String(body.container_code).trim() : null;
    if (body.storage_location !== undefined) updateData.storage_location = body.storage_location ? String(body.storage_location).trim() : null;
    if (body.transporter_name !== undefined) updateData.transporter_name = body.transporter_name ? String(body.transporter_name).trim() : null;
    if (body.transporter_identifier !== undefined) updateData.transporter_identifier = body.transporter_identifier ? String(body.transporter_identifier).trim() : null;
    if (body.destination_name !== undefined) updateData.destination_name = body.destination_name ? String(body.destination_name).trim() : null;
    if (body.transfer_document_ref !== undefined) updateData.transfer_document_ref = body.transfer_document_ref ? String(body.transfer_document_ref).trim() : null;
    if (body.notes !== undefined) updateData.notes = body.notes ? String(body.notes).trim() : null;
    if (status === 'stored' && !current.stored_at) updateData.stored_at = now;
    if (status === 'removed' && !current.removed_at) updateData.removed_at = now;
    if (status === 'closed' && !current.closed_at) updateData.closed_at = now;

    const { data, error } = await context.supabase
      .from('maintenance_waste_records')
      .update(updateData)
      .eq('organization_id', context.organizationId)
      .eq('work_order_id', id)
      .eq('id', wasteId)
      .select('*')
      .single();
    if (error) throw error;

    await context.supabase.from('work_order_events').insert({
      organization_id: context.organizationId,
      work_order_id: id,
      canonical_asset_id: current.canonical_asset_id || null,
      event_type: 'waste_' + status,
      event_at: now,
      actor_id: context.authUserId,
      actor_name: context.userName || context.userEmail || null,
      source_table: 'maintenance_waste_records',
      source_record_id: wasteId,
      summary: status === 'closed' ? 'Gestión de residuo cerrada' : 'Residuo actualizado: ' + status,
      payload: { previous_status: current.status, status },
    });

    return NextResponse.json({ data, complianceCertified: false });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo actualizar el residuo.' }, { status: 500 });
  }
}
