import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { resolveWorkshopHeadScope, workshopHeadCanAccessOrder } from '@/lib/maintenance/workshop-site-scope';
import { UUID_PATTERN } from '@/lib/messages/server';

export type LinkedWorkOrder = {
  id: string;
  organization_id: string;
  work_order_number: string;
  title: string;
  status: string | null;
  workshop_site: string | null;
  assigned_person_id: string | null;
  created_by: string | null;
};

/**
 * The OT API has a stricter scope than organization-level chat: cargo-based
 * module access, assigned execution, plus workshop-head site restrictions.
 * Apply those same checks to BOTH participants before creating any link, and
 * to the current actor again each time linked OT metadata is read.
 *
 * This is server-only. Never trust client-supplied role or organization IDs.
 */
export async function visibleWorkOrderForProfile(
  context: OrganizationSuccessContext, workOrderId: string, profileId: string,
): Promise<LinkedWorkOrder | null> {
  if (!UUID_PATTERN.test(workOrderId) || !UUID_PATTERN.test(profileId)) return null;

  const { data: profile, error: profileError } = await context.supabase.from('profiles')
    .select('id,role,status').eq('id', profileId)
    .eq('organization_id', context.organizationId).maybeSingle();
  if (profileError) throw profileError;
  if (!profile || profile.status !== 'active') return null;

  const { data, error } = await context.supabase.from('maintenance_work_orders')
    .select('id,organization_id,work_order_number,title,status,workshop_site,assigned_person_id,created_by')
    .eq('organization_id', context.organizationId).eq('id', workOrderId).maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const actorContext: OrganizationSuccessContext = {
    ...context,
    userId: profileId,
    role: profileId === context.userId ? context.role : profile.role || undefined,
  };
  const accessLevel = await getModuleAccessLevel(profileId, actorContext.role, MODULE_KEYS.MANT_OPERACIONES);
  const canRead = accessLevel === 'ED' || accessLevel === 'LEC';
  if (!canRead) {
    if (!data.created_by) return null; // Historic OT is restricted to authorized module readers.
    const execution = await requireAssignedMaintenanceExecution(actorContext, workOrderId);
    if (!execution.ok) return null;
  }

  const workshop = await resolveWorkshopHeadScope(actorContext);
  if (!workshopHeadCanAccessOrder(workshop, data)) return null;
  return data as LinkedWorkOrder;
}
