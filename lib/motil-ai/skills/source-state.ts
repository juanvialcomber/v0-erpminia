import type { EvidenceState } from './readiness';

export type SkillEvidenceFacts = {
  products: boolean;
  suppliers: boolean;
  stock: boolean;
  purchaseOrders: boolean;
  supplierInvoices: boolean;
  accountsPayable: boolean;
  costCenters: boolean;
  dte: boolean;
  maintenance: boolean;
  assets: boolean;
  procurementRequests: boolean;
  laudus: 'pending' | 'syncing' | 'updated' | 'review' | 'offline';
  laudusFixedAssets: boolean;
};

function add(set: Set<string>, values: string[]) {
  for (const value of values) set.add(value);
}

export function buildEvidenceState(facts: SkillEvidenceFacts): EvidenceState {
  const availableSources = new Set<string>();
  const syncedDomains = new Set<string>();

  if (facts.products) {
    syncedDomains.add('products');
    add(availableSources, [
      'canonical.products',
      'canonical_product_price_benchmarks_v1',
    ]);
  }

  if (facts.suppliers) {
    syncedDomains.add('suppliers');
    add(availableSources, [
      'canonical.suppliers',
      'supplier_operational_score_v2',
      'supplier_performance_v1',
      'supplier_reconciliation_v1',
    ]);
  }

  if (facts.stock) {
    syncedDomains.add('stock');
    add(availableSources, [
      'warehouse_stock',
      'stock_movements',
      'warehouses',
      'stock_transfers',
      'bodega_canonical_quantity_corrections',
    ]);
  }

  if (facts.purchaseOrders) {
    syncedDomains.add('purchase_orders');
    add(availableSources, [
      'canonical.purchase_orders',
      'canonical.purchase_order_lines',
      'procurement_operational_receipts',
      'procurement_match_exceptions',
      'operational_procurement_finance_ledger_v1',
    ]);
  }

  if (facts.supplierInvoices) {
    syncedDomains.add('supplier_invoices');
    add(availableSources, [
      'procurement_supplier_invoices',
      'procurement_supplier_invoice_lines',
      'procurement_supplier_returns',
      'procurement_supplier_return_lines',
    ]);
  }

  if (facts.accountsPayable) {
    syncedDomains.add('accounts_payable');
    add(availableSources, [
      'procurement_accounts_payable',
      'procurement_supplier_payments',
      'procurement_cash_forecast_v1',
      'procurement_accounts_payable_aging_v1',
    ]);
  }

  if (facts.costCenters) {
    syncedDomains.add('cost_centers');
    add(availableSources, [
      'canonical.cost_centers',
      'intelligence.cost_center_actual_costs',
      'intelligence.cost_center_financials',
    ]);
  }

  if (facts.dte) {
    syncedDomains.add('dte');
    availableSources.add('procurement_sii_dte_imports');
  }

  if (facts.maintenance) {
    add(availableSources, [
      'maintenance_work_orders',
      'work_order_labor_entries',
      'work_order_parts',
      'work_order_external_services',
      'work_order_closure_cost_snapshots',
      'work_order_supply_needs',
      'work_order_material_requirements',
      'maintenance_campaigns',
      'maintenance_campaign_work_orders',
      'maintenance_campaign_dependencies',
    ]);
  }

  if (facts.assets) {
    add(availableSources, [
      'canonical.assets',
      'finance_maintenance_asset_reconciliation_v1',
      'asset_renewal_investment_needs',
      'spare_part_lifecycle_relations',
      'equipment_technical_bom_lines',
    ]);
  }

  if (facts.procurementRequests) {
    add(availableSources, [
      'procurement_intake_requests',
      'procurement_intake_request_lines',
    ]);
  }

  if (facts.laudus === 'updated' || facts.laudus === 'review' || facts.laudus === 'syncing') {
    syncedDomains.add('laudus');
    add(availableSources, [
      'integration.raw_records',
      'integration.reconciliation_items',
      'data_reconciliation_reviews',
    ]);
  }

  if (facts.laudusFixedAssets) {
    syncedDomains.add('fixed_assets');
  }

  return {
    availableSources: [...availableSources].sort(),
    syncedDomains: [...syncedDomains].sort(),
  };
}
