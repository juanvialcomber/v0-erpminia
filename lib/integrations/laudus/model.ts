export type LaudusEntityType =
  | 'product'
  | 'supplier'
  | 'warehouse'
  | 'stock'
  | 'cost_center'
  | 'purchase_order'
  | 'purchase_order_line'
  | 'supplier_invoice'
  | 'supplier_invoice_line'
  | 'accounts_payable'
  | 'payment'
  | 'credit_note'
  | 'fixed_asset'
  | 'accounting_entry'
  | 'bank_statement'
  | 'dte';

export type CanonicalTarget = {
  schema: 'canonical' | 'public' | 'integration';
  table: string;
  authority: 'external_evidence' | 'financial_source' | 'candidate_only';
  autoApply: false;
};

export const LAUDUS_ENTITY_TARGETS: Record<LaudusEntityType, CanonicalTarget> = {
  product: { schema: 'canonical', table: 'products', authority: 'external_evidence', autoApply: false },
  supplier: { schema: 'canonical', table: 'suppliers', authority: 'external_evidence', autoApply: false },
  warehouse: { schema: 'public', table: 'warehouses', authority: 'external_evidence', autoApply: false },
  stock: { schema: 'public', table: 'warehouse_stock', authority: 'external_evidence', autoApply: false },
  cost_center: { schema: 'canonical', table: 'cost_centers', authority: 'financial_source', autoApply: false },
  purchase_order: { schema: 'canonical', table: 'purchase_orders', authority: 'financial_source', autoApply: false },
  purchase_order_line: { schema: 'canonical', table: 'purchase_order_lines', authority: 'financial_source', autoApply: false },
  supplier_invoice: { schema: 'public', table: 'procurement_supplier_invoices', authority: 'financial_source', autoApply: false },
  supplier_invoice_line: { schema: 'public', table: 'procurement_supplier_invoice_lines', authority: 'financial_source', autoApply: false },
  accounts_payable: { schema: 'public', table: 'procurement_accounts_payable', authority: 'financial_source', autoApply: false },
  payment: { schema: 'integration', table: 'reconciliation_items', authority: 'candidate_only', autoApply: false },
  credit_note: { schema: 'public', table: 'procurement_supplier_credit_notes', authority: 'financial_source', autoApply: false },
  fixed_asset: { schema: 'canonical', table: 'assets', authority: 'candidate_only', autoApply: false },
  accounting_entry: { schema: 'integration', table: 'raw_records', authority: 'financial_source', autoApply: false },
  bank_statement: { schema: 'integration', table: 'raw_records', authority: 'financial_source', autoApply: false },
  dte: { schema: 'public', table: 'procurement_sii_dte_imports', authority: 'external_evidence', autoApply: false },
};

export type ExternalRecordEnvelope = {
  entityType: LaudusEntityType;
  externalId: string;
  sourceUpdatedAt?: string | null;
  payload: Record<string, unknown>;
};

export function normalizeRut(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.toUpperCase().replace(/[^0-9K]/g, '');
  if (normalized.length < 2) return null;
  return normalized.slice(0, -1) + '-' + normalized.slice(-1);
}

export function normalizeCode(value: unknown): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const normalized = String(value).trim().toUpperCase().replace(/\s+/g, ' ');
  return normalized || null;
}

export function reconciliationKey(record: ExternalRecordEnvelope): string | null {
  const p = record.payload;
  switch (record.entityType) {
    case 'product':
      return normalizeCode(p.code ?? p.productCode ?? p.sku);
    case 'supplier':
      return normalizeRut(p.vatId ?? p.taxId ?? p.rut);
    case 'warehouse':
      return normalizeCode(p.code ?? p.warehouseCode ?? p.id);
    case 'cost_center':
      return normalizeCode(p.code ?? p.costCenterCode ?? p.id);
    case 'fixed_asset':
      return normalizeCode(p.code ?? p.assetCode ?? p.fixedAssetCode ?? p.id);
    case 'purchase_order':
      return normalizeCode(p.number ?? p.orderNumber ?? p.id);
    default:
      return normalizeCode(record.externalId);
  }
}
