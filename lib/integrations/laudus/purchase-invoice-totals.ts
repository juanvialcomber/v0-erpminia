import { listLaudus } from './client';
import { extractLaudusListRows } from './financial-masters';

export const LAUDUS_INVOICE_TOTAL_FIELDS = [
  'purchaseInvoiceId',
  'totals.net',
  'totals.VAT',
  'totals.total',
  'totals.currencyCode',
] as const;

export async function fetchAllLaudusPurchaseInvoiceTotals() {
  const payload = await listLaudus('/purchases/invoices/list', {
    options: { offset: 0, limit: 0 },
    fields: [...LAUDUS_INVOICE_TOTAL_FIELDS],
  });

  return {
    rows: extractLaudusListRows(payload),
    calls: 2,
  };
}
