import { NextResponse } from 'next/server';
import type { OrganizationSuccessContext } from '@/lib/api/organization-context';

export async function requireAssignedMaintenanceExecution(
  context: OrganizationSuccessContext,
  workOrderId: string,
) {
  const { data: person, error: personError } = await context.supabase
    .from('people')
    .select('id')
    .eq('organization_id', context.organizationId)
    .eq('profile_id', context.userId)
    .eq('employment_status', 'active')
    .maybeSingle();

  if (personError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: personError.message || 'No se pudo resolver la identidad operativa' }, { status: 500 }),
    };
  }

  if (!person) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Tu usuario no está vinculado a una persona operativa activa.' }, { status: 403 }),
    };
  }

  const { data: order, error: orderError } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,assigned_person_id')
    .eq('organization_id', context.organizationId)
    .eq('id', workOrderId)
    .maybeSingle();

  if (orderError) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: orderError.message || 'No se pudo verificar la asignación de la OT' }, { status: 500 }),
    };
  }

  if (!order) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'No se encontró la orden de trabajo' }, { status: 404 }),
    };
  }

  if (order.assigned_person_id !== person.id) {
    return {
      ok: false as const,
      response: NextResponse.json({ error: 'Sólo la persona asignada puede ejecutar esta orden de trabajo.' }, { status: 403 }),
    };
  }

  return { ok: true as const, personId: person.id };
}


export function canBypassAssignedMaintenanceExecution(
  context: OrganizationSuccessContext,
  accessLevel: string | null | undefined,
) {
  return accessLevel === 'ED' && context.role !== 'tecnico';
}
