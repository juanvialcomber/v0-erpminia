export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type DomainState = 'updated' | 'review' | 'stale' | 'manual';

type DomainSummary = {
  key: string;
  label: string;
  state: DomainState;
  rows: number;
  updatedAt: string | null;
  detail: string;
  automated: boolean;
};

type QueryResult = {
  count: number | null;
  data?: Array<{ synced_at?: string | null }> | null;
  error: { message: string } | null;
};

function date(value: unknown) {
  if (!value) return null;
  const parsed = new Date(String(value));
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function ageHours(value: string | null) {
  if (!value) return Number.POSITIVE_INFINITY;
  return Math.max(0, (Date.now() - new Date(value).getTime()) / 3_600_000);
}

async function countAndLatest(query: PromiseLike<QueryResult>) {
  const result = await query;
  if (result.error) throw new Error(result.error.message);
  const updatedAt = date(result.data?.[0]?.synced_at);
  return { rows: result.count ?? 0, updatedAt };
}

function stateFor(updatedAt: string | null, automated: boolean, staleAfterHours: number): DomainState {
  if (!updatedAt) return 'review';
  if (!automated) return ageHours(updatedAt) > staleAfterHours ? 'stale' : 'manual';
  return ageHours(updatedAt) > staleAfterHours ? 'stale' : 'updated';
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [inventory, procurement, finance, maintenance] = await Promise.all([
    requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO),
    requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS),
    requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS),
    requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES),
  ]);

  if (![inventory, procurement, finance, maintenance].some((result) => result.authorized)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 403 });
  }

  const organizationId = context.organizationId;

  try {
    const [sourceResult, healthResult, inventoryResult, suppliers, invoices, payments, payables, costCenters, fixedAssets] = await Promise.all([
      context.supabase
        .from('laudus_source_status_service_v1')
        .select('enabled,latest_status,latest_run_at')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      context.supabase
        .from('laudus_sync_health_service_v1')
        .select('domain,health_status,last_success_at,next_due_at,records_processed,records_changed,conflicts,consecutive_failures,open_incidents,critical_incidents')
        .eq('organization_id', organizationId)
        .order('run_order'),
      context.supabase
        .from('laudus_inventory_readiness_service_v1')
        .select('products,stock_rows,latest_stock_sync,open_reconciliation')
        .eq('organization_id', organizationId)
        .maybeSingle(),
      countAndLatest(
        context.supabase
          .from('laudus_suppliers_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
      countAndLatest(
        context.supabase
          .from('laudus_purchase_invoices_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
      countAndLatest(
        context.supabase
          .from('laudus_purchase_payments_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
      countAndLatest(
        context.supabase
          .from('laudus_accounts_payable_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
      countAndLatest(
        context.supabase
          .from('laudus_cost_centers_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
      countAndLatest(
        context.supabase
          .from('laudus_fixed_assets_service_v1')
          .select('synced_at', { count: 'exact' })
          .eq('organization_id', organizationId)
          .order('synced_at', { ascending: false })
          .limit(1),
      ),
    ]);

    if (sourceResult.error) throw sourceResult.error;
    if (healthResult.error) throw healthResult.error;
    if (inventoryResult.error) throw inventoryResult.error;

    const healthRows = healthResult.data || [];
    const automated = new Map(
      healthRows.map((row) => [String(row.domain), {
        health: String(row.health_status || 'review'),
        updatedAt: date(row.last_success_at),
        nextDueAt: date(row.next_due_at),
        recordsProcessed: Number(row.records_processed || 0),
        conflicts: Number(row.conflicts || 0),
        failures: Number(row.consecutive_failures || 0),
        incidents: Number(row.open_incidents || 0),
        criticalIncidents: Number(row.critical_incidents || 0),
      }]),
    );

    const productHealth = automated.get('products');
    const stockHealth = automated.get('stock');
    const financeHealth = automated.get('financial_masters');

    const domains: DomainSummary[] = [
      {
        key: 'products',
        label: 'Productos',
        state: productHealth?.health === 'healthy' ? 'updated' : 'review',
        rows: Number(inventoryResult.data?.products || 0),
        updatedAt: productHealth?.updatedAt || null,
        detail: productHealth?.health === 'healthy' ? 'Catálogo actualizado automáticamente.' : 'Requiere revisar la última actualización.',
        automated: true,
      },
      {
        key: 'stock',
        label: 'Stock',
        state: stockHealth?.health === 'healthy' ? 'updated' : 'review',
        rows: Number(inventoryResult.data?.stock_rows || 0),
        updatedAt: date(inventoryResult.data?.latest_stock_sync) || stockHealth?.updatedAt || null,
        detail: Number(inventoryResult.data?.open_reconciliation || 0) > 0
          ? `${Number(inventoryResult.data?.open_reconciliation || 0)} diferencia(s) pendientes de conciliación.`
          : 'Stock ERP actualizado automáticamente.',
        automated: true,
      },
      {
        key: 'suppliers',
        label: 'Proveedores',
        state: stateFor(suppliers.updatedAt, false, 48),
        rows: suppliers.rows,
        updatedAt: suppliers.updatedAt,
        detail: 'Disponible como evidencia Laudus; actualización periódica aún no automatizada.',
        automated: false,
      },
      {
        key: 'invoices',
        label: 'Facturas de compra',
        state: stateFor(invoices.updatedAt, false, 48),
        rows: invoices.rows,
        updatedAt: invoices.updatedAt,
        detail: 'Disponible para contraste financiero; actualización periódica aún no automatizada.',
        automated: false,
      },
      {
        key: 'payments',
        label: 'Pagos',
        state: stateFor(payments.updatedAt, false, 48),
        rows: payments.rows,
        updatedAt: payments.updatedAt,
        detail: 'Disponible para conciliación; actualización periódica aún no automatizada.',
        automated: false,
      },
      {
        key: 'payables',
        label: 'Cuentas por pagar',
        state: stateFor(payables.updatedAt, false, 48),
        rows: payables.rows,
        updatedAt: payables.updatedAt,
        detail: 'Disponible para análisis; actualización periódica aún no automatizada.',
        automated: false,
      },
      {
        key: 'cost_centers',
        label: 'Centros de costo',
        state: financeHealth?.health === 'healthy' ? 'updated' : stateFor(costCenters.updatedAt, true, 36),
        rows: costCenters.rows,
        updatedAt: costCenters.updatedAt,
        detail: 'Actualización diaria.',
        automated: true,
      },
      {
        key: 'fixed_assets',
        label: 'Activos fijos',
        state: financeHealth?.health === 'healthy' ? 'updated' : stateFor(fixedAssets.updatedAt, true, 36),
        rows: fixedAssets.rows,
        updatedAt: fixedAssets.updatedAt,
        detail: 'Actualización diaria.',
        automated: true,
      },
    ];

    const attention = domains.filter((domain) => domain.state === 'review' || domain.state === 'stale');
    const sourceEnabled = Boolean(sourceResult.data?.enabled);
    const connected = sourceEnabled && !attention.some((domain) => domain.state === 'review');
    const current = domains.filter((domain) => domain.state === 'updated').length;
    const manual = domains.filter((domain) => domain.state === 'manual' || domain.state === 'stale').length;

    return NextResponse.json({
      status: !sourceEnabled ? 'offline' : attention.length ? 'review' : 'healthy',
      headline: !sourceEnabled
        ? 'Laudus está desconectado'
        : attention.length
          ? `${attention.length} área(s) requieren actualización o revisión`
          : 'Laudus está operativo',
      summary: {
        connected,
        current,
        total: domains.length,
        manual,
        attention: attention.length,
      },
      sourceUpdatedAt: date(sourceResult.data?.latest_run_at),
      domains,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[laudus/status]', error);
    return NextResponse.json({ error: 'No fue posible verificar el estado de Laudus.' }, { status: 500 });
  }
}
