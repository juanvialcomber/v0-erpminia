import { listLaudus } from './client';
import { extractLaudusListRows } from './financial-masters';

export const LAUDUS_INVOICE_TOTAL_FIELDS = [
  'purchaseInvoiceId',
  'totals.net',
  'totals.VAT',
  'totals.total',
  'totals.currencyCode',
] as const;

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function fetchAllLaudusPurchaseInvoiceTotals(start: Date, end: Date) {
  const payload = await listLaudus('/purchases/invoices/list', {
    options: { offset: 0, limit: 0 },
    fields: [...LAUDUS_INVOICE_TOTAL_FIELDS],
    filterBy: [
      {
        field: 'issuedDate',
        operator: '>=',
        value: `${dateOnly(start)}T00:00:00`,
      },
      {
        field: 'issuedDate',
        operator: '<=',
        value: `${dateOnly(end)}T23:59:59`,
      },
    ],
    orderBy: [
      { field: 'purchaseInvoiceId', direction: 'ASC' },
    ],
  });

  return {
    rows: extractLaudusListRows(payload),
    calls: 2,
  };
}
