export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

const CLOSED_STATUSES = new Set(['completed', 'closed', 'cancelled', 'canceled']);

function normalizeStatus(value: unknown) {
  return String(value || '').trim().toLowerCase();
}

async function resolvePerson(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>) {
  if (!context.userEmail) return null;
  const { data } = await context.supabase
    .from('people')
    .select('id, full_name, email, role_title, employment_status')
    .eq('organization_id', context.organizationId)
    .ilike('email', context.userEmail)
    .limit(1)
    .maybeSingle();
  return data || null;
}

async function getAssignedWorkOrder(context: Extract<Awaited<ReturnType<typeof getOrganizationContext>>, { ok: true }>, personId: string, workOrderId: string) {
  const { data, error } = await context.supabase
    .from('maintenance_work_orders')
    .select('id, organization_id, work_order_number, title, description, status, priority, scheduled_date, start_date, planned_duration_hours, actual_duration_hours, canonical_asset_id, assigned_person_id, assigned_to_name')
    .eq('id', workOrderId)
    .eq('organization_id', context.organizationId)
    .eq('assigned_person_id', personId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const person = await resolvePerson(context);
  if (!person) {
    return NextResponse.json({
      person: null,
      workOrders: [],
      message: 'Tu usuario todavía no está vinculado a una persona por email en esta organización.',
      source: 'canonical',
    });
  }

  const { data: workOrders, error } = await context.supabase
    .from('maintenance_work_orders')
    .select('id, work_order_number, title, description, status, priority, scheduled_date, start_date, planned_duration_hours, actual_duration_hours, canonical_asset_id, assigned_person_id, assigned_to_name')
    .eq('organization_id', context.organizationId)
    .eq('assigned_person_id', person.id)
    .order('scheduled_date', { ascending: true, nullsFirst: false })
    .limit(100);

  if (error) return NextResponse.json({ error: 'No se pudieron cargar tus órdenes de trabajo.' }, { status: 500 });

  const activeOrders = (workOrders || []).filter((row: any) => !CLOSED_STATUSES.has(normalizeStatus(row.status)));
  const orderIds = activeOrders.map((row: any) => row.id);
  const assetIds = Array.from(new Set(activeOrders.map((row: any) => row.canonical_asset_id).filter(Boolean))) as string[];

  const [assetsResult, eventsResult, laborResult, partsResult] = await Promise.all([
    assetIds.length > 0
      ? context.supabase.from('maintenance_assets').select('id, asset_code, asset_name, location, criticality').eq('organization_id', context.organizationId).in('id', assetIds)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length > 0
      ? context.supabase.from('work_order_events').select('id, work_order_id, event_type, event_at, summary, actor_name').eq('organization_id', context.organizationId).in('work_order_id', orderIds).order('event_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length > 0
      ? context.supabase.from('work_order_labor_entries').select('id, work_order_id, started_at, ended_at, hours, notes').eq('organization_id', context.organizationId).eq('technician_id', person.id).in('work_order_id', orderIds).order('started_at', { ascending: false }).limit(100)
      : Promise.resolve({ data: [], error: null }),
    orderIds.length > 0
      ? context.supabase.from('work_order_parts').select('id, work_order_id, quantity_requested, quantity_issued, quantity_installed, quantity_returned, status').eq('organization_id', context.organizationId).in('work_order_id', orderIds).limit(500)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (assetsResult.error || eventsResult.error || laborResult.error || partsResult.error) {
    return NextResponse.json({ error: 'No se pudo completar la vista de terreno.' }, { status: 500 });
  }

  return NextResponse.json({
    person,
    workOrders: activeOrders,
    assets: assetsResult.data || [],
    events: eventsResult.data || [],
    labor: laborResult.data || [],
    parts: partsResult.data || [],
    source: 'canonical',
  });
}

export async function POST(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const person = await resolvePerson(context);
  if (!person) return NextResponse.json({ error: 'Tu usuario no está vinculado a una persona por email.' }, { status: 400 });

  const body = await request.json().catch(() => null);
  const action = typeof body?.action === 'string' ? body.action : '';
  const workOrderId = typeof body?.workOrderId === 'string' ? body.workOrderId : '';
  if (!workOrderId || !['start', 'note', 'labor'].includes(action)) {
    return NextResponse.json({ error: 'Acción de terreno inválida.' }, { status: 400 });
  }

  const workOrder = await getAssignedWorkOrder(context, person.id, workOrderId);
  if (!workOrder || CLOSED_STATUSES.has(normalizeStatus(workOrder.status))) {
    return NextResponse.json({ error: 'La OT no está asignada a tu persona o ya está cerrada.' }, { status: 403 });
  }

  if (action === 'start') {
    return NextResponse.json(
      {
        error: 'Inicia la OT desde su flujo canónico para validar preparación, conflictos y cronómetro.',
        href: `/dashboard/mantenimiento/ordenes-trabajo/${workOrderId}`,
      },
      { status: 409 },
    );
  }

  if (action === 'note') {
    const note = typeof body?.note === 'string' ? body.note.trim() : '';
    if (!note) return NextResponse.json({ error: 'Escribe una nota de terreno.' }, { status: 400 });

    const { error } = await context.supabase.from('work_order_events').insert({
      organization_id: context.organizationId,
      work_order_id: workOrderId,
      canonical_asset_id: workOrder.canonical_asset_id,
      event_type: 'field_note',
      event_at: new Date().toISOString(),
      actor_id: context.userId,
      actor_name: person.full_name || context.userName || context.userEmail,
      source_table: 'maintenance_work_orders',
      source_record_id: workOrderId,
      summary: note,
      payload: {},
    });

    if (error) return NextResponse.json({ error: 'No se pudo guardar la nota.' }, { status: 500 });
    return NextResponse.json({ ok: true });
  }

  if (!workOrder.canonical_asset_id) {
    return NextResponse.json({ error: 'La OT no tiene un equipo canónico asociado para registrar mano de obra.' }, { status: 400 });
  }

  const startedAt = typeof body?.startedAt === 'string' ? body.startedAt : '';
  const endedAt = typeof body?.endedAt === 'string' ? body.endedAt : '';
  const start = new Date(startedAt);
  const end = new Date(endedAt);
  if (!startedAt || !endedAt || Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return NextResponse.json({ error: 'Ingresa un inicio y término válidos.' }, { status: 400 });
  }

  const hours = (end.getTime() - start.getTime()) / 3_600_000;
  if (hours <= 0 || hours > 24) return NextResponse.json({ error: 'El intervalo de trabajo debe ser mayor a 0 y menor o igual a 24 horas.' }, { status: 400 });

  const notes = typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;
  const { error: laborError } = await context.supabase.from('work_order_labor_entries').insert({
    organization_id: context.organizationId,
    work_order_id: workOrderId,
    canonical_asset_id: workOrder.canonical_asset_id,
    technician_id: person.id,
    technician_name: person.full_name,
    started_at: start.toISOString(),
    ended_at: end.toISOString(),
    hours: Number(hours.toFixed(2)),
    hourly_cost: 0,
    notes,
    created_by: context.userId,
  });

  if (laborError) return NextResponse.json({ error: 'No se pudo registrar la mano de obra.' }, { status: 500 });

  await context.supabase.from('work_order_events').insert({
    organization_id: context.organizationId,
    work_order_id: workOrderId,
    canonical_asset_id: workOrder.canonical_asset_id,
    event_type: 'labor_logged',
    event_at: end.toISOString(),
    actor_id: context.userId,
    actor_name: person.full_name || context.userName || context.userEmail,
    source_table: 'work_order_labor_entries',
    source_record_id: workOrderId,
    summary: `Mano de obra registrada: ${Number(hours.toFixed(2))} h.`,
    payload: {},
  });

  return NextResponse.json({ ok: true, hours: Number(hours.toFixed(2)) });
}
