import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { canBypassAssignedMaintenanceExecution, requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { requireOperationalMaintenanceWorkOrder } from '@/lib/maintenance/work-order-scope';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;
  const guard = await requireOperationalMaintenanceWorkOrder(context.supabase, context.organizationId, id);
  if (!guard.ok) return NextResponse.json({ error: guard.error }, { status: guard.status });
  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const assigned = await requireAssignedMaintenanceExecution(context, id);
  if (!canBypassAssignedMaintenanceExecution(context, level) && !assigned.ok) return assigned.response;

  const body = await request.json().catch(() => null);
  const operationId = typeof body?.operationId === 'string' ? body.operationId : '';
  const notes = typeof body?.notes === 'string' ? body.notes.trim() : '';
  const capturedAt = typeof body?.capturedAt === 'string' ? body.capturedAt : '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(operationId) || !notes || notes.length > 8000 || !Number.isFinite(Date.parse(capturedAt))) {
    return NextResponse.json({ error: 'Nota offline inválida.' }, { status: 400 });
  }
  const captureTime = Date.parse(capturedAt);
  if (captureTime > Date.now() + 300000 || captureTime < Date.now() - 30 * 86400000) {
    return NextResponse.json({ error: 'Fecha de captura fuera de rango; requiere revisión.' }, { status: 409 });
  }

  // Capture the narrowed organization context in immutable local bindings.
  // TypeScript does not preserve discriminated-union narrowing inside callbacks.
  const { supabase, organizationId, userId } = context;
  async function findExistingNote() {
    return supabase.from('work_order_events')
      .select('id,work_order_id,actor_id,payload')
      .eq('organization_id', organizationId)
      .eq('source_table', 'motil_offline_note')
      .eq('source_record_id', operationId)
      .maybeSingle();
  }
  function duplicateResponse(existing: { id: number; work_order_id: string; actor_id: string | null; payload: unknown }) {
    const stored = existing.payload && typeof existing.payload === 'object' ? existing.payload as Record<string, unknown> : {};
    if (existing.work_order_id !== id || existing.actor_id !== userId
        || stored.notes !== notes || stored.captured_at !== capturedAt) {
      return NextResponse.json({ error: 'Operación offline en conflicto; requiere revisión.' }, { status: 409 });
    }
    return NextResponse.json({ ok: true, duplicate: true, eventId: existing.id });
  }
  const { data: existing, error: lookupError } = await findExistingNote();
  if (lookupError) return NextResponse.json({ error: 'No se pudo verificar la sincronización.' }, { status: 500 });
  if (existing) return duplicateResponse(existing);

  const { data, error } = await context.supabase.from('work_order_events').insert({
    organization_id: context.organizationId,
    work_order_id: id,
    event_type: 'offline_field_note',
    event_at: capturedAt,
    actor_id: context.userId,
    actor_name: context.userName || context.userEmail || null,
    source_table: 'motil_offline_note',
    source_record_id: operationId,
    summary: 'Nota de faena registrada sin conexión',
    payload: { notes, captured_at: capturedAt, synchronized_at: new Date().toISOString() },
  }).select('id').single();
  if (error?.code === '23505') {
    const { data: concurrent, error: retryError } = await findExistingNote();
    if (retryError || !concurrent) return NextResponse.json({ error: 'No se pudo conciliar la operación duplicada.' }, { status: 409 });
    return duplicateResponse(concurrent);
  }
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, eventId: data.id });
}
