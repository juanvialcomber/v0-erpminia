export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const definitions = [
  { action_key: 'reports', title: 'Definir reportes de Bodega', owner: 'Esteban + Ariel' },
  { action_key: 'information_flow', title: 'Levantar flujo de información', owner: 'Esteban → Ariel' },
  { action_key: 'worker_tasks', title: 'Describir tareas por bodeguero', owner: 'Esteban' },
  { action_key: 'critical_stock', title: 'Definir mínimos por producto', owner: 'Esteban + Ariel' },
  { action_key: 'central_stock', title: 'Conciliar y compartir stock central', owner: 'MOTIL + Bodega' },
] as const;

type ActionKey = typeof definitions[number]['action_key'];
type ActionStatus = 'pending' | 'in_progress' | 'ready_for_validation' | 'completed' | 'blocked';

function isActionKey(value: string): value is ActionKey {
  return definitions.some((item) => item.action_key === value);
}

function canComplete(actionKey: ActionKey, payload: Record<string, unknown>, evidence: string) {
  if (actionKey === 'reports') {
    const reports = Array.isArray(payload.reports) ? payload.reports as Array<Record<string, unknown>> : [];
    return reports.length > 0 && reports.every((row) =>
      ['name', 'content', 'frequency', 'recipients'].every((key) => String(row[key] || '').trim()),
    );
  }
  if (actionKey === 'information_flow') {
    return ['source', 'receiver', 'recorded_by', 'output'].every((key) => String(payload[key] || '').trim()) && evidence.trim().length >= 5;
  }
  if (actionKey === 'worker_tasks') {
    const tasks = Array.isArray(payload.tasks) ? payload.tasks as Array<Record<string, unknown>> : [];
    return tasks.length > 0 && tasks.every((row) =>
      ['person', 'task', 'frequency'].every((key) => String(row[key] || '').trim()),
    );
  }
  if (actionKey === 'critical_stock') {
    const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
    return items.length > 0
      && items.every((row) =>
        String(row.product_code || '').trim()
        && String(row.product_name || '').trim()
        && String(row.unit || '').trim()
        && Number.isFinite(Number(row.proposed_minimum))
        && Number(row.proposed_minimum) >= 0
        && row.confirmed_by_esteban === true
        && row.confirmed_by_ariel === true,
      )
      && evidence.trim().length >= 5;
  }
  return Boolean(
    String(payload.cutoff_date || '').trim()
    && Number(payload.snapshot_rows) > 0
    && String(payload.source_reference || '').trim()
    && String(payload.reconciliation_reference || '').trim()
    && String(payload.delivery_reference || '').trim()
    && evidence.trim().length >= 5,
  );
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const seeds = definitions.map((item) => ({
      organization_id: context.organizationId,
      ...item,
      status: 'pending',
      payload: {},
    }));
    const seedResult = await context.supabase
      .from('bodega_meeting_actions_v1')
      .upsert(seeds, { onConflict: 'organization_id,action_key', ignoreDuplicates: true });
    if (seedResult.error) throw seedResult.error;

    const { data, error } = await context.supabase
      .from('bodega_meeting_actions_v1')
      .select('action_key,title,owner,status,payload,evidence_reference,updated_at')
      .eq('organization_id', context.organizationId)
      .order('action_key');
    if (error) throw error;
    return NextResponse.json({ actions: data || [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudieron cargar las acciones de Bodega.' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const actionKey = String(body?.actionKey || '');
  const status = String(body?.status || '') as ActionStatus;
  const payload = body?.payload;
  const evidenceReference = String(body?.evidenceReference || '').trim();
  const definition = definitions.find((item) => item.action_key === actionKey);

  if (!definition || !isActionKey(actionKey)) return NextResponse.json({ error: 'Acción de Bodega inválida.' }, { status: 400 });
  if (!['pending','in_progress','ready_for_validation','completed','blocked'].includes(status)) return NextResponse.json({ error: 'Estado inválido.' }, { status: 400 });
  if (status === 'completed' && !access.canWrite) return NextResponse.json({ error: 'Puedes guardar avances y enviarlos a validación; el cierre final requiere permiso de edición de Bodega.' }, { status: 403 });
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || JSON.stringify(payload).length > 50000) {
    return NextResponse.json({ error: 'Completa los datos de la acción antes de guardar.' }, { status: 400 });
  }
  if (status === 'completed' && !canComplete(actionKey, payload as Record<string, unknown>, evidenceReference)) {
    return NextResponse.json({ error: 'Faltan datos o validaciones requeridas para cerrar esta acción.' }, { status: 400 });
  }

  const { error } = await context.supabase
    .from('bodega_meeting_actions_v1')
    .upsert({
      organization_id: context.organizationId,
      action_key: actionKey,
      title: definition.title,
      owner: definition.owner,
      status,
      payload,
      evidence_reference: evidenceReference || null,
      updated_by: context.userId,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'organization_id,action_key' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, actionKey, status });
}
