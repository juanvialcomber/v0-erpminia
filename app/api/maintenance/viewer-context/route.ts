export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
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

    const creationCapability = await getMaintenanceWorkOrderCreationCapability(context);
    const workshopScope = await resolveWorkshopHeadScope(context);
    const canCreateWorkOrder = creationCapability.canCreate;
    const canCreateEmergencyWorkOrder = creationCapability.canCreateEmergency;

    const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
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

    const mode = accessLevel === 'ED' ? baseMode : hasAssignedOperationalWork ? 'execution' : baseMode;

    return NextResponse.json({
      mode,
      // Used only to namespace local IndexedDB drafts on shared devices.
      offlineScope: `${context.organizationId}:${context.userId}`,
      cargoName,
      canEdit: accessLevel === 'ED' || hasAssignedOperationalWork,
      canCreateWorkOrder,
      canCreateEmergencyWorkOrder,
      emergencySelfAssignOnly: creationCapability.emergencySelfAssignOnly,
      personId: creationCapability.personId,
      personName: creationCapability.personName,
      hasAssignedOperationalWork,
      workshopSite: workshopScope.isWorkshopHead ? workshopScope.site : null,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo resolver el contexto de mantenimiento' }, { status: 500 });
  }
}
