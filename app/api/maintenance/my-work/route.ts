export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { chileTodayDateKey } from '@/lib/maintenance/work-order-calendar-date.mjs';
import { buildAssignedWorkActions } from '@/lib/maintenance/my-work-priority.mjs';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const profileIds = new Set<string>([access.user.id]);
    for (const authUserId of [context.authUserId, access.user.id]) {
      if (!authUserId) continue;
      const { data: identityLink, error: identityError } = await context.supabase
        .from('auth_profile_identity_links')
        .select('profile_id')
        .eq('auth_user_id', authUserId)
        .maybeSingle();
      if (identityError) throw identityError;
      if (identityLink?.profile_id) profileIds.add(identityLink.profile_id);
    }

    const canonicalProfileId = Array.from(profileIds).find((id) => id !== access.user.id) || access.user.id;
    const { data: profile, error: profileError } = await context.supabase
      .from('profiles')
      .select('id,cargo_id')
      .eq('organization_id', context.organizationId)
      .eq('id', canonicalProfileId)
      .maybeSingle();
    if (profileError) throw profileError;
    if (!profile) {
      return NextResponse.json({ error: 'No se pudo resolver el perfil operativo de tu sesión.' }, { status: 403 });
    }

    let cargoName: string | null = null;
    if (profile?.cargo_id) {
      const { data: cargo, error: cargoError } = await context.supabase
        .from('cargos')
        .select('name')
        .eq('id', profile.cargo_id)
        .maybeSingle();
      if (cargoError) throw cargoError;
      cargoName = cargo?.name || null;
    }

    if (resolveMaintenanceViewerMode(cargoName) !== 'execution') {
      return NextResponse.json({ error: 'Esta vista está reservada para perfiles de ejecución.' }, { status: 403 });
    }

    const { data: person, error: personError } = await context.supabase
      .from('people')
      .select('id')
      .eq('organization_id', context.organizationId)
      .in('profile_id', Array.from(profileIds))
      .eq('employment_status', 'active')
      .limit(2);
    if (personError) throw personError;
    const uniquePeople = new Map((person || []).map((row) => [row.id, row]));
    if (uniquePeople.size > 1) {
      return NextResponse.json({ error: 'La sesión está vinculada a más de una persona operativa activa.' }, { status: 403 });
    }
    const resolvedPerson = person?.[0];

    if (!resolvedPerson?.id) {
      return NextResponse.json({
        identityLinked: false,
        actions: [],
        canEdit: access.canWrite,
        sources: ['profiles', 'cargos', 'people'],
      });
    }

    const { data: rows, error: workOrdersError } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,work_order_number,title,status,priority,scheduled_date,start_date,created_at,timer_status,total_timer_minutes,canonical_asset_id')
      .eq('organization_id', context.organizationId)
      .eq('assigned_person_id', resolvedPerson.id)
      .not('created_by', 'is', null)
      .in('status', ['open', 'assigned', 'pending', 'planned', 'in_progress'])
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(200);
    if (workOrdersError) throw workOrdersError;

    const actions = buildAssignedWorkActions(rows || [], chileTodayDateKey());

    return NextResponse.json({
      identityLinked: true,
      actions,
      canEdit: access.canWrite,
      generatedAt: new Date().toISOString(),
      sources: ['profiles', 'cargos', 'people', 'maintenance_work_orders'],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar tu trabajo asignado' }, { status: 500 });
  }
}
