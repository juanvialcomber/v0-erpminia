export type MotilSkillDomain =
  | 'maintenance'
  | 'inventory'
  | 'procurement'
  | 'finance'
  | 'supplier'
  | 'asset'
  | 'integration'
  | 'data_quality';

export type MotilSkillRisk = 'read_only' | 'review_required' | 'human_action_required';

export type MotilSkill = {
  key: string;
  name: string;
  domain: MotilSkillDomain;
  summary: string;
  evidence: string[];
  outputs: string[];
  risk: MotilSkillRisk;
  requiresSyncedData?: string[];
};

export const MOTIL_CONTEXTUAL_SKILLS: MotilSkill[] = [
  {
    key: 'laudus-source-reconciliation',
    name: 'Conciliar Laudus con MOTIL',
    domain: 'integration',
    summary: 'Compara evidencia externa con entidades canónicas sin sobrescribirlas automáticamente.',
    evidence: ['integration.raw_records', 'integration.reconciliation_items'],
    outputs: ['matched', 'new_candidate', 'conflict', 'source evidence'],
    risk: 'review_required',
    requiresSyncedData: ['laudus'],
  },
  {
    key: 'inventory-stock-risk',
    name: 'Riesgo de stock',
    domain: 'inventory',
    summary: 'Detecta faltantes, sobrestock y repuestos críticos usando existencias reales y necesidades operacionales.',
    evidence: ['warehouse_stock', 'canonical.products', 'work_order_material_requirements'],
    outputs: ['critical shortage', 'reorder candidate', 'excess stock', 'affected work orders'],
    risk: 'review_required',
    requiresSyncedData: ['products', 'stock'],
  },
  {
    key: 'procurement-three-way-match',
    name: 'Conciliación compra-recepción-factura',
    domain: 'procurement',
    summary: 'Revisa cantidades y valores entre orden de compra, recepción y factura.',
    evidence: ['canonical.purchase_orders', 'canonical.purchase_order_lines', 'procurement_operational_receipts', 'procurement_supplier_invoices'],
    outputs: ['matched', 'quantity variance', 'price variance', 'missing receipt', 'missing invoice'],
    risk: 'review_required',
    requiresSyncedData: ['purchase_orders', 'supplier_invoices'],
  },
  {
    key: 'supplier-performance',
    name: 'Desempeño de proveedores',
    domain: 'supplier',
    summary: 'Explica precio, cumplimiento, devoluciones, lead time y excepciones por proveedor.',
    evidence: ['canonical.suppliers', 'canonical.purchase_orders', 'procurement_supplier_returns', 'supplier_operational_score_v2'],
    outputs: ['lead time', 'price trend', 'exception rate', 'supplier evidence'],
    risk: 'read_only',
    requiresSyncedData: ['suppliers', 'purchase_orders'],
  },
  {
    key: 'maintenance-cost-trace',
    name: 'Costo real de mantenimiento',
    domain: 'maintenance',
    summary: 'Une OT, mano de obra, materiales, servicios externos y compras para explicar costo real por activo.',
    evidence: ['maintenance_work_orders', 'work_order_labor_entries', 'work_order_parts', 'work_order_external_services', 'work_order_closure_cost_snapshots'],
    outputs: ['actual cost', 'cost drivers', 'unreconciled cost', 'source trail'],
    risk: 'read_only',
  },
  {
    key: 'asset-financial-360',
    name: 'Activo 360 financiero',
    domain: 'asset',
    summary: 'Relaciona historial operacional, mantenciones, repuestos, compras y evidencia financiera de un activo.',
    evidence: ['canonical.assets', 'maintenance_work_orders', 'canonical.purchase_order_lines', 'finance_maintenance_asset_reconciliation_v1'],
    outputs: ['lifetime cost', 'recent maintenance cost', 'linked purchases', 'unresolved finance links'],
    risk: 'read_only',
    requiresSyncedData: ['fixed_assets', 'purchase_orders'],
  },
  {
    key: 'cost-center-control',
    name: 'Control por centro de costo',
    domain: 'finance',
    summary: 'Compara gasto real y trazabilidad operacional por centro de costo sin inferir presupuesto faltante.',
    evidence: ['canonical.cost_centers', 'cost_center_actual_costs', 'cost_center_financials'],
    outputs: ['actual cost', 'source coverage', 'unmapped transactions', 'period comparison'],
    risk: 'read_only',
    requiresSyncedData: ['cost_centers'],
  },
  {
    key: 'accounts-payable-exposure',
    name: 'Exposición de cuentas por pagar',
    domain: 'finance',
    summary: 'Agrupa obligaciones por proveedor, vencimiento y relación con compras operacionales.',
    evidence: ['procurement_accounts_payable', 'procurement_supplier_payments', 'procurement_cash_forecast_v1'],
    outputs: ['due exposure', 'overdue exposure', 'supplier concentration', 'linked operational purchases'],
    risk: 'read_only',
    requiresSyncedData: ['accounts_payable'],
  },
  {
    key: 'purchase-price-variance',
    name: 'Variación de precio de compra',
    domain: 'procurement',
    summary: 'Detecta variaciones reales de precio por producto/proveedor manteniendo moneda y unidad comparables.',
    evidence: ['canonical.purchase_order_lines', 'canonical.products', 'canonical.suppliers', 'canonical_product_price_benchmarks_v1'],
    outputs: ['price delta', 'supplier comparison', 'unit mismatch warning', 'historical evidence'],
    risk: 'read_only',
    requiresSyncedData: ['products', 'purchase_orders'],
  },
  {
    key: 'data-quality-guardian',
    name: 'Guardián de calidad',
    domain: 'data_quality',
    summary: 'Detecta duplicados, identidades no resueltas, unidades incompatibles y fuentes contradictorias antes de contaminar métricas.',
    evidence: ['integration.reconciliation_items', 'data_reconciliation_reviews', 'canonical source payloads'],
    outputs: ['duplicate', 'identity conflict', 'unit conflict', 'source conflict', 'review queue'],
    risk: 'review_required',
  },
  {
    key: 'purchase-need-context',
    name: 'Necesidad de compra contextual',
    domain: 'procurement',
    summary: 'Explica si una necesidad de compra está sustentada por OT, stock, consumo, lead time y criticidad del activo.',
    evidence: ['work_order_supply_needs', 'warehouse_stock', 'procurement_intake_requests', 'canonical.products'],
    outputs: ['evidence-backed need', 'stock available', 'existing request', 'missing evidence'],
    risk: 'human_action_required',
    requiresSyncedData: ['products', 'stock'],
  },
  {
    key: 'dte-procurement-check',
    name: 'Cruce DTE y compras',
    domain: 'finance',
    summary: 'Relaciona DTE de proveedor con facturas y compras sin aprobar pagos ni contabilizar automáticamente.',
    evidence: ['procurement_sii_dte_imports', 'procurement_supplier_invoices', 'canonical.purchase_orders'],
    outputs: ['linked DTE', 'missing purchase order', 'amount mismatch', 'duplicate fiscal identity'],
    risk: 'review_required',
    requiresSyncedData: ['dte', 'supplier_invoices'],
  },
];

export function getMotilSkill(key: string): MotilSkill | undefined {
  return MOTIL_CONTEXTUAL_SKILLS.find((skill) => skill.key === key);
}
