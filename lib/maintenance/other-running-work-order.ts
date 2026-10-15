import type { OrganizationSuccessContext } from '@/lib/api/organization-context';

// Fail closed if another OT is already recording time for this same canonical assignee.
// The check is tenant-scoped and shared by status-start and timer-play/resume routes.
export async function findOtherRunningWorkOrder(
  context: OrganizationSuccessContext,
  workOrderId: string,
): Promise<{ id: string; work_order_number: string | null } | null> {
  const { data: target, error: targetError } = await context.supabase
    .from('maintenance_work_orders')
    .select('assigned_person_id')
    .eq('organization_id', context.organizationId)
    .eq('id', workOrderId)
    .maybeSingle();
  if (targetError) throw targetError;
  if (!target?.assigned_person_id) return null;

  const { data: concurrent, error } = await context.supabase
    .from('maintenance_work_orders')
    .select('id,work_order_number')
    .eq('organization_id', context.organizationId)
    .eq('assigned_person_id', target.assigned_person_id)
    .eq('timer_status', 'running')
    .neq('id', workOrderId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return concurrent || null;
}
