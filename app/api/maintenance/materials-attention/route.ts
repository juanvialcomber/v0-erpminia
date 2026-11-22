export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { canBypassAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';

type Order = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  scheduled_date: string | null;
};

const priorityRank: Record<string, number> = {
  critical: 0,
  urgent: 0,
  emergency: 0,
  high: 1,
  medium: 2,
  normal: 2,
  low: 3,
};

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const accessLevel = await getModuleAccessLevel(
      context.userId,
      context.role,
      MODULE_KEYS.MANT_OPERACIONES,
    );
    // A mechanic may see their assigned OT, but never the full company's
    // planning queue through this read-only leadership endpoint.
    if (!canBypassAssignedMaintenanceExecution(context, accessLevel)) {
      return NextResponse.json({ error: 'Esta revisión corresponde a planificación y supervisión.' }, { status: 403 });
    }

    const { data, count, error } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,work_order_number,title,priority,status,scheduled_date', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .not('created_by', 'is', null)
      .in('status', ['open', 'in_progress'])
      .order('scheduled_date', { ascending: true, nullsFirst: false })
      .limit(200);
    if (error) throw error;
    if (count === null) throw new Error('No se pudo determinar la cobertura de órdenes.');
    const orders = (data || []) as Order[];
    const orderIds = orders.map((order) => order.id);
    const recorded = new Set<string>();

    for (let offset = 0; offset < orderIds.length; offset += 50) {
      const { data: requirements, count: requirementCount, error: requirementError } = await context.supabase
        .from('work_order_material_requirements')
        .select('work_order_id', { count: 'exact' })
        .eq('organization_id', context.organizationId)
        .neq('status', 'cancelled')
        .in('work_order_id', orderIds.slice(offset, offset + 50))
        .limit(1000);
      if (requirementError) throw requirementError;
      if (requirementCount === null || requirementCount > (requirements || []).length) {
        throw new Error('La consulta de materiales no está completa.');
      }
      for (const requirement of requirements || []) recorded.add(requirement.work_order_id);
    }

    const without = orders.filter((order) => !recorded.has(order.id));
    without.sort((a, b) => {
      const aPriority = priorityRank[String(a.priority || '').toLowerCase()] ?? 4;
      const bPriority = priorityRank[String(b.priority || '').toLowerCase()] ?? 4;
      if (aPriority !== bPriority) return aPriority - bPriority;
      const dateComparison = String(a.scheduled_date || '9999').localeCompare(String(b.scheduled_date || '9999'));
      return dateComparison || String(a.work_order_number || a.id).localeCompare(String(b.work_order_number || b.id));
    });

    return NextResponse.json({
      source: 'maintenance_work_orders + work_order_material_requirements',
      activeOrdersTotal: count,
      activeOrdersReviewed: orders.length,
      requirementsRegisteredOrders: recorded.size,
      withoutRegisteredRequirements: without.length,
      partial: count > orders.length,
      reviewCandidates: without.slice(0, 5).map((order) => ({
        workOrderId: order.id,
        workOrderNumber: order.work_order_number,
        title: order.title,
        priority: order.priority,
        status: order.status,
        scheduledDate: order.scheduled_date,
      })),
      mandatory: false,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[maintenance/materials-attention][GET]', error);
    return NextResponse.json({ error: 'No se pudo revisar la relación entre OT y materiales.' }, { status: 500 });
  }
}
