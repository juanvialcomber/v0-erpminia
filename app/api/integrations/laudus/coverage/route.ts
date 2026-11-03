export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';

const DATASETS = [
  ['products', 'Productos', null],
  ['suppliers', 'Proveedores', 'laudus_suppliers_service_v1'],
  ['warehouses', 'Bodegas', 'laudus_warehouses_service_v1'],
  ['cost_centers', 'Centros de costo', 'laudus_cost_centers_service_v1'],
  ['fixed_assets', 'Activos fijos', 'laudus_fixed_assets_service_v1'],
  ['stock', 'Stock por bodega', null],
  ['purchase_orders', 'Órdenes de compra', null],
  ['purchase_invoices', 'Facturas de compra', 'laudus_purchase_invoices_service_v1'],
  ['purchase_payments', 'Pagos de compras', 'laudus_purchase_payments_service_v1'],
  ['accounts_payable', 'Cuentas por pagar', 'laudus_accounts_payable_service_v1'],
  ['bank_statements', 'Cartolas bancarias', 'laudus_bank_statements_service_v1'],
  ['accounting_entries', 'Asientos contables', 'laudus_accounting_entries_service_v1'],
  ['waybills', 'Guías de compra', null],
  ['credit_notes', 'Notas de crédito', 'laudus_credit_notes_service_v1'],
  ['dtes', 'DTE pendientes', 'laudus_dtes_service_v1'],
  ['product_kardex', 'Kardex consultado', null],
] as const;

type DatasetStatus = 'integrated' | 'empty' | 'unavailable';

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'La cobertura Laudus requiere permisos de administración.' }, { status: 403 });
  }

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const datasets = await Promise.all(DATASETS.map(async ([key, label, serviceView]) => {
    if (!serviceView) {
      return {
        key,
        label,
        table: null,
        records: null,
        status: 'unavailable' as DatasetStatus,
      };
    }

    try {
      const { count, error } = await context.supabase
        .from(serviceView)
        .select('organization_id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId);
      if (error) throw error;
      const records = count == null ? null : Number(count);
      if (records == null) throw new Error('count unavailable');
      return {
        key,
        label,
        table: serviceView,
        records,
        status: (records > 0 ? 'integrated' : 'empty') as DatasetStatus,
      };
    } catch {
      return {
        key,
        label,
        table: serviceView,
        records: null,
        status: 'unavailable' as DatasetStatus,
      };
    }
  }));

  const SALES_DATASETS = [
    ['sales_customers', 'Clientes', 'sales_customer'],
    ['sales_salesmen', 'Vendedores', 'sales_salesman'],
    ['sales_orders', 'Órdenes de venta', 'sales_order'],
    ['sales_invoices', 'Facturas de venta', 'sales_invoice'],
    ['sales_waybills', 'Guías de venta', 'sales_waybill'],
    ['sales_receipts', 'Cobranzas', 'sales_receipt'],
  ] as const;

  const salesDatasets = SALES_DATASETS.map(([key, label, entityType]) => ({
    key,
    label,
    table: null,
    entityType,
    records: null,
    status: 'unavailable' as DatasetStatus,
  }));

  const allDatasets = [...datasets, ...salesDatasets];

  let health: any[] = [];
  try {
    const { data, error } = await context.supabase
      .from('laudus_sync_health_service_v1')
      .select('domain,enabled,health_status,last_success_at,last_failure_at,next_due_at,records_processed,records_changed,conflicts,api_calls,consecutive_failures,last_error,open_incidents,critical_incidents')
      .eq('organization_id', context.organizationId)
      .order('domain');
    if (error) throw error;
    health = data || [];
  } catch {
    health = [];
  }

  const verifiedDatasets = allDatasets.filter((row) => row.status !== 'unavailable');
  const verifiedRecords = verifiedDatasets.reduce((sum, row) => sum + Number(row.records ?? 0), 0);
  const integratedDatasets = allDatasets.filter((row) => row.status === 'integrated').length;
  const unavailableDatasets = allDatasets.filter((row) => row.status === 'unavailable').length;
  const healthyDomains = health.filter((row) => row.health_status === 'healthy').length;
  const unhealthyDomains = health.filter((row) => row.health_status !== 'healthy').length;
  const openIncidents = health.reduce((sum, row) => sum + Number(row.open_incidents || 0), 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalRecords: verifiedRecords,
      verifiedRecords,
      datasets: allDatasets.length,
      verifiedDatasets: verifiedDatasets.length,
      integratedDatasets,
      unavailableDatasets,
      healthyDomains,
      unhealthyDomains,
      openIncidents,
    },
    datasets: allDatasets,
    health,
  });
}
