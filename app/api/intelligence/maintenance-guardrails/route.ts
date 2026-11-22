export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getUserModuleAccess, isAdminRole, MODULE_KEYS } from '@/lib/api/module-access';
import { resolveMaintenanceViewerMode } from '@/lib/maintenance/viewer-mode';
import { canReviewMaterialAttention } from '@/lib/maintenance/material-attention.mjs';
import { evaluateMotilOperationalCanaries } from '@/lib/intelligence/motil-operational-canaries.mjs';

// Bounded, on-demand diagnostic: no cron, model call, schema change or write.
const PAGE_SIZE = 200;
const MAX_WORK_ORDERS = 1000;
const MAX_CORE_ERRORS = 100;
const HEADERS = { 'Cache-Control': 'private, no-store' };

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const rights = await getUserModuleAccess(context.userId);
    const admin = isAdminRole(context.role);
    const accessLevel = admin ? 'ED' : (rights.access[MODULE_KEYS.MANT_OPERACIONES] || 'SR');
    const viewerMode = resolveMaintenanceViewerMode(rights.cargoName);
    if (!admin && !canReviewMaterialAttention(viewerMode, accessLevel)) {
      return NextResponse.json({ error: 'La revisión preventiva está disponible para planificación y jefaturas autorizadas.' }, { status: 403, headers: HEADERS });
    }

    const now = new Date();
    const db = context.supabase;
    // Inspect live operational and historical-closed OTs only; skip legacy
    // readonly imported orders to avoid inventing anomalies on old records.
    const selectOrders = 'id,work_order_number,status,timer_status,timer_start_time,assigned_person_id';
    const { data: first, count, error: firstError } = await db
      .from('maintenance_work_orders')
      .select(selectOrders, { count: 'exact' })
      .eq('organization_id', context.organizationId)
      .not('created_by', 'is', null)
      .order('id', { ascending: true })
      .range(0, PAGE_SIZE - 1);
    if (firstError) throw firstError;
    if (count === null) throw new Error('No se pudo determinar el universo de OT.');
    const orders = [...(first || [])];
    while (orders.length < count && orders.length < MAX_WORK_ORDERS) {
      const offset = orders.length;
      const { data: next, error } = await db
        .from('maintenance_work_orders')
        .select(selectOrders)
        .eq('organization_id', context.organizationId)
        .not('created_by', 'is', null)
        .order('id', { ascending: true })
        .range(offset, Math.min(offset + PAGE_SIZE, MAX_WORK_ORDERS) - 1);
      if (error) throw error;
      if (!next?.length) throw new Error('Revisión de OT incompleta por respuesta vacía.');
      orders.push(...next);
    }

    const canReadStock = admin || ['ED', 'LEC'].includes(rights.access[MODULE_KEYS.BODEGA_INVENTARIO] || 'SR');
    const since = new Date(now.getTime() - 24 * 3600_000).toISOString();
    const scopedDomains = canReadStock ? ['maintenance', 'inventory'] : ['maintenance'];
    const [stockResult, aiResult, criticalResult] = await Promise.all([
      canReadStock
        ? db.from('bodega_central_stock_canonicalization_summary_v1')
            .select('source_synced_at')
            .eq('organization_id', context.organizationId)
            .limit(1)
            .maybeSingle()
        : Promise.resolve(null),
      db.from('motil_ai_core_errors')
        .select('error_code,created_at', { count: 'exact' })
        .eq('organization_id', context.organizationId)
        .in('domain', scopedDomains)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(MAX_CORE_ERRORS),
      // Count all critical failures without downloading their text or raw
      // records: the newest-100 sample alone can omit older P1 evidence.
      db.from('motil_ai_core_errors')
        .select('id', { head: true, count: 'exact' })
        .eq('organization_id', context.organizationId)
        .in('domain', scopedDomains)
        .eq('error_code', 'canonical_source_contract_failure')
        .gte('created_at', since)
        .limit(1),
    ]);

    if (stockResult?.error) console.warn('[motil-canaries] stock source unavailable', { code: stockResult.error.code || null });
    if (aiResult.error) console.warn('[motil-canaries] intelligence error source unavailable', { code: aiResult.error.code || null });
    if (criticalResult.error) console.warn('[motil-canaries] critical source count unavailable', { code: criticalResult.error.code || null });

    const stockSource = !canReadStock
      ? { state: 'not_authorized' as const }
      : stockResult?.error || !stockResult?.data
        ? { state: 'unavailable' as const }
        : { state: 'observed' as const, syncedAt: stockResult.data.source_synced_at };
    const coreErrorSource = aiResult.error || criticalResult.error || aiResult.count === null || criticalResult.count === null
      ? { state: 'unavailable' as const }
      : {
          state: 'observed' as const,
          rows: aiResult.data || [],
          truncated: (aiResult.count || 0) > MAX_CORE_ERRORS,
          criticalErrorCount: criticalResult.count || 0,
        };

    const evaluated = evaluateMotilOperationalCanaries({
      workOrders: orders,
      totalWorkOrders: count,
      stockSource,
      coreErrorSource,
      now: now.toISOString(),
    });
    return NextResponse.json({
      ...evaluated,
      generatedAt: now.toISOString(),
      operation: 'N3uralia Intelligence · preventive_canaries_v1',
      cadence: 'on_dashboard_open_and_refresh',
      actorMode: viewerMode,
      noAutomaticRemediation: true,
    }, { headers: HEADERS });
  } catch (error) {
    const detail = error as { code?: string };
    console.error('[motil-canaries] scan failed', { code: detail?.code || 'unknown' });
    return NextResponse.json({ error: 'No fue posible completar los controles preventivos de MOTIL. La operación habitual continúa disponible.' }, { status: 503, headers: HEADERS });
  }
}
