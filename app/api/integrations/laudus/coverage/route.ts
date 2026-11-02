export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';

const DATASETS = [
  ['products', 'Productos', 'laudus_products'],
  ['suppliers', 'Proveedores', 'laudus_suppliers'],
  ['warehouses', 'Bodegas', 'laudus_warehouses'],
  ['cost_centers', 'Centros de costo', 'laudus_cost_centers'],
  ['fixed_assets', 'Activos fijos', 'laudus_fixed_assets'],
  ['stock', 'Stock por bodega', 'laudus_product_stock'],
  ['purchase_orders', 'Órdenes de compra', 'laudus_purchase_orders'],
  ['purchase_invoices', 'Facturas de compra', 'laudus_purchase_invoices'],
  ['purchase_payments', 'Pagos de compras', 'laudus_purchase_payments'],
  ['accounts_payable', 'Cuentas por pagar', 'laudus_accounts_payable'],
  ['bank_statements', 'Cartolas bancarias', 'laudus_bank_statements'],
  ['accounting_entries', 'Asientos contables', 'laudus_accounting_entries'],
  ['waybills', 'Guías de compra', 'laudus_waybills'],
  ['credit_notes', 'Notas de crédito', 'laudus_credit_notes'],
  ['dtes', 'DTE pendientes', 'laudus_dtes'],
  ['product_kardex', 'Kardex consultado', 'laudus_product_kardex'],
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

  const integration = context.supabase.schema('integration');

  const datasets = await Promise.all(DATASETS.map(async ([key, label, table]) => {
    try {
      const { count, error } = await integration
        .from(table)
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId);
      if (error) throw error;
      const records = Number(count || 0);
      return {
        key,
        label,
        table,
        records,
        status: (records > 0 ? 'integrated' : 'empty') as DatasetStatus,
      };
    } catch {
      return {
        key,
        label,
        table,
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

  const salesDatasets = await Promise.all(SALES_DATASETS.map(async ([key, label, entityType]) => {
    try {
      const { count, error } = await integration
        .from('raw_records')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('entity_type', entityType)
        .eq('is_current', true);
      if (error) throw error;
      const records = Number(count || 0);
      return {
        key,
        label,
        table: 'raw_records',
        entityType,
        records,
        status: (records > 0 ? 'integrated' : 'empty') as DatasetStatus,
      };
    } catch {
      return {
        key,
        label,
        table: 'raw_records',
        entityType,
        records: null,
        status: 'unavailable' as DatasetStatus,
      };
    }
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

  const totalRecords = allDatasets.reduce((sum, row) => sum + (row.records || 0), 0);
  const integratedDatasets = allDatasets.filter((row) => row.status === 'integrated').length;
  const healthyDomains = health.filter((row) => row.health_status === 'healthy').length;
  const unhealthyDomains = health.filter((row) => row.health_status !== 'healthy').length;
  const openIncidents = health.reduce((sum, row) => sum + Number(row.open_incidents || 0), 0);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    summary: {
      totalRecords,
      datasets: allDatasets.length,
      integratedDatasets,
      healthyDomains,
      unhealthyDomains,
      openIncidents,
    },
    datasets: allDatasets,
    health,
  });
}
