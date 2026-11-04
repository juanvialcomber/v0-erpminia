export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { requireAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { getWorkOrderReleaseReadiness } from '@/lib/maintenance/work-order-release-readiness';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  const { id } = await params;

  const accessLevel = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  const execution = await requireAssignedMaintenanceExecution(context, id);
  if (accessLevel !== 'ED' && accessLevel !== 'LEC' && !execution.ok) {
    return execution.response;
  }

  try {
    const readiness = await getWorkOrderReleaseReadiness(context.supabase, context.organizationId, id);
    return NextResponse.json(readiness);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo verificar la preparación de la OT.' },
      { status: 500 },
    );
  }
}
