export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getMaintenanceActorAuthority } from '@/lib/maintenance/work-order-authority';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { resolveWorkshopHeadScope } from '@/lib/maintenance/workshop-site-scope';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { data: profile, error: profileError } = await context.supabase
      .from('profiles')
      .select('cargo_id')
      .eq('id', context.userId)
      .eq('organization_id', context.organizationId)
      .maybeSingle();
    if (profileError) throw profileError;

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

    const baseMode = resolveMaintenanceViewerMode(cargoName);

    const { data: creatorPerson, error: creatorPersonError } = await context.supabase
      .from('people')
      .select('id,full_name')
      .eq('organization_id', context.organizationId)
      .eq('profile_id', context.userId)
      .eq('employment_status', 'active')
      .maybeSingle();
    if (creatorPersonError) throw creatorPersonError;

    const authority = await getMaintenanceActorAuthority(context);
    const workshopScope = await resolveWorkshopHeadScope(context);
    const canCreateWorkOrder = authority.canCreateWorkOrder;
    const canCreateEmergencyWorkOrder = authority.canCreateEmergencyWorkOrder;

    let hasAssignedOperationalWork = false;
    if (creatorPerson?.id) {
      const { count, error: assignedError } = await context.supabase
        .from('maintenance_work_orders')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', context.organizationId)
        .eq('assigned_person_id', creatorPerson.id)
        .not('status', 'in', '("completed","closed","cancelled","canceled")');
      if (assignedError) throw assignedError;
      hasAssignedOperationalWork = (count || 0) > 0;
    }

    const mode = hasAssignedOperationalWork && !authority.canPlan ? 'execution' : baseMode;

    return NextResponse.json({
      mode,
      // Used only to namespace local IndexedDB drafts on shared devices.
      offlineScope: `${context.organizationId}:${context.userId}`,
      cargoName,
      canEdit: authority.canPlan || hasAssignedOperationalWork,
      permissions: {
        canPlan: authority.canPlan,
        canCreateWorkOrder,
        canCreateEmergencyWorkOrder,
        canApprove: authority.canApprove,
      },
      canCreateWorkOrder,
      canCreateEmergencyWorkOrder,
      emergencySelfAssignOnly: authority.emergencySelfAssignOnly,
      personId: authority.personId,
      personName: authority.personName,
      hasAssignedOperationalWork,
      workshopSite: workshopScope.isWorkshopHead ? workshopScope.site : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo resolver el contexto de mantenimiento' }, { status: 500 });
  }
}
