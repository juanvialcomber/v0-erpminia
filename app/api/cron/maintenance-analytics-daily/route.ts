import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Daily maintenance analytics aggregation job
 * Runs once per day to pre-compute analytics and populate aggregation tables
 * Can be called via Vercel Crons or external scheduler
 */
async function runDailyMaintenanceAnalytics(req: NextRequest) {
  // Vercel Cron uses GET; fail closed if the secret is absent.
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

  try {
    console.log('[v0] Starting daily maintenance analytics aggregation...');

    // Get all organizations (in this case, just the main one)
    const { data: orgs } = await sb.from('organizations').select('id');

    if (!orgs || orgs.length === 0) {
      return NextResponse.json({ error: 'No organizations found' }, { status: 400 });
    }

    for (const org of orgs) {
      await aggregateAnalyticsForOrg(sb, org.id);
    }

    console.log('[v0] Daily aggregation completed successfully');
    return NextResponse.json({ success: true, message: 'Analytics aggregated successfully' });
  } catch (error) {
    console.error('[v0] Aggregation error:', error);
    return NextResponse.json({ error: 'Aggregation failed' }, { status: 500 });
  }
}

async function aggregateAnalyticsForOrg(sb: any, orgId: string) {
  const today = new Date().toISOString().split('T')[0];
  const thirtyDaysAgo = new Date();
  thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

  try {
    interface WorkOrder {
      id: string;
      status: string;
      priority: string;
      created_at: string;
      completion_date: string | null;
      scheduled_date: string | null;
      total_timer_minutes: number | null;
    }

    // Fetch work orders
    const { data: workOrders } = await sb
      .from('maintenance_work_orders')
      .select('id, status, priority, created_at, completion_date, scheduled_date, total_timer_minutes')
      .eq('organization_id', orgId)
      .gte('created_at', thirtyDaysAgo.toISOString()) as { data: WorkOrder[] | null };

    const woList: WorkOrder[] = workOrders || [];

    // Calculate metrics
    const total = woList.length;
    const completed = woList.filter((wo: WorkOrder) => wo.status === 'completed').length;
    const pending = woList.filter((wo: WorkOrder) => wo.status === 'pending').length;

    let overdue = 0;
    const now = new Date();
    woList.forEach((wo: WorkOrder) => {
      if (wo.scheduled_date) {
        const scheduled = new Date(wo.scheduled_date);
        if (scheduled < now && wo.status !== 'completed') {
          overdue += 1;
        }
      }
    });

    const completionRate = total > 0 ? Math.round((completed / total) * 100) : 0;

    let avgCompletionHours = 0;
    const completedWOs = woList.filter((wo: WorkOrder) => wo.status === 'completed' && wo.total_timer_minutes);
    if (completedWOs.length > 0) {
      const totalMinutes = completedWOs.reduce((sum: number, wo: WorkOrder) => sum + (wo.total_timer_minutes || 0), 0);
      avgCompletionHours = Math.round((totalMinutes / completedWOs.length) / 60 * 100) / 100;
    }

    const totalHoursLogged = woList.reduce((sum: number, wo: WorkOrder) => sum + (wo.total_timer_minutes || 0), 0) / 60;

    // Insert aggregation data
    await sb.from('maintenance_analytics_daily').upsert(
      {
        organization_id: orgId,
        analysis_date: today,
        total_work_orders: total,
        completed_work_orders: completed,
        pending_work_orders: pending,
        overdue_work_orders: overdue,
        completion_rate: completionRate,
        avg_completion_hours: avgCompletionHours,
        total_hours_logged: Math.round(totalHoursLogged * 100) / 100,
      },
      { onConflict: 'organization_id,analysis_date' }
    );

    console.log(`[v0] Aggregated ${orgId} analytics for ${today}`);
  } catch (error) {
    console.error(`[v0] Error aggregating org ${orgId}:`, error);
    throw error;
  }
}

// Vercel scheduled invocations use GET. POST remains available to authorized operators.
export const GET = runDailyMaintenanceAnalytics;
export const POST = runDailyMaintenanceAnalytics;
