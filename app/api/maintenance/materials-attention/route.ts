export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { canBypassAssignedMaintenanceExecution } from '@/lib/maintenance/work-order-execution-access';
import { summarizeMaterialAttention } from '@/lib/maintenance/material-attention.mjs';

type Order = {
  id: string;
  work_order_number: string | null;
  title: string | null;
  priority: string | null;
  status: string | null;
  scheduled_date: string | null;
};

// Match operational OT statuses used by the mechanic's My Work view.
// Paused may also appear as an OT status in historical migrations.
const ACTIVE_STATUSES = ['open', 'assigned', 'pending', 'planned', 'in_progress', 'paused'];
const ORDER_PAGE_SIZE = 200;
const MAX_ORDERS_REVIEWED = 1000;

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

    // Review the whole active population before ranking candidates. The first
    // page alone cannot identify the most critical OT across a large tenant.
    const { data, count, error } = await context.supabase
      .from('maintenance_work_orders')
      .select('id,work_order_number,title,priority,status,scheduled_date', { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .not('created_by', 'is', null)
      .in('status', ACTIVE_STATUSES)
      .order('id', { ascending: true })
      .range(0, ORDER_PAGE_SIZE - 1);
    if (error) throw error;
    if (count === null) throw new Error('No se pudo determinar la cobertura de órdenes.');
    const orders = [...((data || []) as Order[])];
    while (orders.length < count && orders.length < MAX_ORDERS_REVIEWED) {
      const offset = orders.length;
      const { data: nextOrders, error: pageError } = await context.supabase
        .from('maintenance_work_orders')
        .select('id,work_order_number,title,priority,status,scheduled_date')
        .eq('organization_id', context.organizationId)
        .not('created_by', 'is', null)
        .in('status', ACTIVE_STATUSES)
        .order('id', { ascending: true })
        .range(offset, Math.min(offset + ORDER_PAGE_SIZE, MAX_ORDERS_REVIEWED) - 1);
      if (pageError) throw pageError;
      if (!nextOrders?.length) throw new Error('No fue posible leer toda la página de OT activas.');
      orders.push(...(nextOrders as Order[]));
    }
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

    const summary = summarizeMaterialAttention(orders, recorded);
    const partial = count > orders.length;
    return NextResponse.json({
      source: 'maintenance_work_orders + work_order_material_requirements',
      activeOrdersTotal: count,
      ...summary,
      // Never present a "top 5" when unseen orders may rank higher.
      reviewCandidates: partial ? [] : summary.reviewCandidates,
      partial,
      mandatory: false,
      asOf: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[maintenance/materials-attention][GET]', error);
    return NextResponse.json({ error: 'No se pudo revisar la relación entre OT y materiales.' }, { status: 500 });
  }
}
