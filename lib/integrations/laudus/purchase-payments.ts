import { extractLaudusListRows, hasLaudusPageMore } from './financial-masters';
import { listLaudus } from './client';

export const LAUDUS_PAYMENT_FIELDS = [
  'paymentId',
  'paymentType',
  'issuedDate',
  'dueDate',
  'document',
  'deposited',
  'bank',
  'accountOther',
  'journalEntryIssued',
  'journalEntryDeposited',
  'notes',
  'purchaseInvoices',
] as const;

export async function fetchAllLaudusPurchasePayments() {
  const rows: Record<string, unknown>[] = [];
  const pageSize = 25;
  const maxPages = 1000;
  let calls = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await listLaudus('/purchases/payments/list', {
      options: { offset: page * pageSize, limit: pageSize },
      fields: [...LAUDUS_PAYMENT_FIELDS],
    });
    calls += 1;
    const batch = extractLaudusListRows(payload);
    rows.push(...batch);
    if (!hasLaudusPageMore(batch, pageSize)) break;
  }

  return { rows, calls };
}
