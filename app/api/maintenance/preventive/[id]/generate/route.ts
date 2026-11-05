export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getMaintenanceWorkOrderCreationCapability } from '@/lib/maintenance/work-order-create-access';
import { applyStandardJobPlanToWorkOrder } from '@/lib/maintenance/apply-standard-job-plan';

export async function POST(request: NextRequest, contextRoute: { params: Promise<{ id: string }> }) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const creationCapability = await getMaintenanceWorkOrderCreationCapability(context);
  if (!creationCapability.canCreate) return NextResponse.json({ error: 'Tu cargo no puede generar OT preventivas.' }, { status: 403 });

  try {
    const { id } = await contextRoute.params;
    const body = await request.json().catch(() => ({}));
    const { data: schedule, error: scheduleError } = await context.supabase.from('preventive_maintenance_schedules').select('id').eq('organization_id', context.organizationId).eq('id', id).maybeSingle();
    if (scheduleError) throw scheduleError;
    if (!schedule) return NextResponse.json({ error: 'El plan no pertenece a tu organización.' }, { status: 404 });
    const { data, error } = await context.supabase.rpc('create_work_order_from_schedule', {
      p_schedule_id: id,
      p_assigned_person_id: body?.assignedPersonId || null,
    });

    if (error) throw error;

    const { data: application, error: applicationError } = await context.supabase
      .from('maintenance_standard_job_plan_applications')
      .select('plan_id')
      .eq('organization_id', context.organizationId)
      .eq('preventive_schedule_id', id)
      .eq('status', 'active')
      .maybeSingle();
    if (applicationError) throw applicationError;

    let planApplied = false;
    let createdRequirements = 0;
    if (application?.plan_id && data) {
      const result = await applyStandardJobPlanToWorkOrder({
        supabase: context.supabase,
        organizationId: context.organizationId,
        userId: context.userId,
        planId: application.plan_id,
        workOrderId: data,
      });
      planApplied = true;
      createdRequirements = result.createdRequirements;
    }

    return NextResponse.json({ workOrderId: data, planApplied, createdRequirements }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo generar la orden desde el plan';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
