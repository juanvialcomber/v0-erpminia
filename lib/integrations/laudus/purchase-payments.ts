import { extractLaudusListRows } from './financial-masters';
import { listLaudus } from './client';

export const LAUDUS_PAYMENT_FIELDS = [
  'paymentId',
  'paymentType.code',
  'paymentType.description',
  'issuedDate',
  'dueDate',
  'document',
  'deposited',
  'bank.bankId',
  'bank.name',
  'notes',
  'purchaseInvoices.itemId',
  'purchaseInvoices.purchaseInvoiceId',
  'purchaseInvoices.docNumber',
  'purchaseInvoices.supplier.supplierId',
  'purchaseInvoices.supplier.name',
  'purchaseInvoices.originalAmount',
  'purchaseInvoices.currencyCode',
  'purchaseInvoices.parityToMainCurrency',
  'purchaseInvoices.amount',
  'purchaseInvoices.costCenter.costCenterId',
] as const;

function day(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function fetchAllLaudusPurchasePayments(start: Date, end: Date) {
  const payload = await listLaudus('/purchases/payments/list', {
    options: { offset: 0, limit: 0 },
    fields: [...LAUDUS_PAYMENT_FIELDS],
    filterBy: [
      { field: 'issuedDate', operator: '>=', value: `${day(start)}T00:00:00` },
      { field: 'issuedDate', operator: '<=', value: `${day(end)}T23:59:59` },
    ],
    orderBy: [{ field: 'paymentId', direction: 'ASC' }],
  });

  return {
    rows: extractLaudusListRows(payload),
    calls: 2,
  };
}
