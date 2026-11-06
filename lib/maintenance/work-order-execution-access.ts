import { NextResponse } from 'next/server';
import type { OrganizationSuccessContext } from '@/lib/api/organization-context';

async function resolveAssignedExecutionPerson(context: OrganizationSuccessContext) {
  const profileIds = new Set<string>([context.userId]);

  for (const authUserId of [context.authUserId, context.userId]) {
    if (!authUserId) continue;
    const { data: identityLink, error: identityError } = await context.supabase
      .from('auth_profile_identity_links')
      .select('profile_id')
      .eq('auth_user_id', authUserId)
      .maybeSingle();

    if (identityError) throw identityError;
    if (identityLink?.profile_id) profileIds.add(identityLink.profile_id);
  }

  const { data: people, error: peopleError } = await context.supabase
    .from('people')
    .select('id,profile_id')
    .eq('organization_id', context.organizationId)
    .in('profile_id', Array.from(profileIds))
    .eq('employment_status', 'active')
    .limit(2);

  if (peopleError) throw peopleError;
  if (!people?.length) return null;

  // Fail closed if the identity bridge ever points at more than one active person.
  const uniquePeople = new Map(people.map((person: { id: string; profile_id?: string | null }) => [person.id, person]));
  if (uniquePeople.size !== 1) {
    throw new Error('La identidad autenticada está vinculada a más de una persona operativa activa.');
  }

  return people[0];
}

export async function requireAssignedMaintenanceExecution(
  context: OrganizationSuccessContext,
  workOrderId: string,
) {
  let person: { id: string; profile_id?: string | null } | null = null;
  try {
    person = await resolveAssignedExecutionPerson(context);
  } catch (personError) {
    return {
      ok: false as const,
      response: NextResponse.json({
        error: personError instanceof Error ? personError.message : 'No se pudo resolver la identidad operativa',
      }, { status: 500 }),
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
