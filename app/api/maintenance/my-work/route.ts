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
    const { data: profile, error: profileError } = await context.supabase
      .from('profiles')
      .select('cargo_id')
      .eq('id', access.user.id)
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

    if (resolveMaintenanceViewerMode(cargoName) !== 'execution') {
      return NextResponse.json({ error: 'Esta vista está reservada para perfiles de ejecución.' }, { status: 403 });
    }

    const { data: person, error: personError } = await context.supabase
      .from('people')
      .select('id')
      .eq('organization_id', context.organizationId)
      .eq('profile_id', access.user.id)
      .maybeSingle();
    if (personError) throw personError;

    if (!person?.id) {
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
      .eq('assigned_person_id', person.id)
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
