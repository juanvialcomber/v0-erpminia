export type TaxDocumentDirection =
  | 'inbound_invoice'
  | 'outbound_invoice'
  | 'purchase_invoice_issued'
  | 'purchase_invoice_role_conflict'
  | 'waybill'
  | 'other';
export function classifyTaxDocument(documentType: unknown, issuerTaxId: unknown, receiverTaxId: unknown, companyTaxId: unknown): TaxDocumentDirection;
export function taxDocumentCounterparty(direction: TaxDocumentDirection, issuerTaxId: unknown, receiverTaxId: unknown, companyTaxId: unknown): string | null;
