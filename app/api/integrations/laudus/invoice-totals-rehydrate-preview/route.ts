export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, listLaudus } from '@/lib/integrations/laudus/client';

const PAYMENT_FIELDS = [
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

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const payload = await listLaudus('/purchases/payments/list', {
    options: { offset: 0, limit: 5 },
    fields: [...PAYMENT_FIELDS],
    filterBy: [
      { field: 'issuedDate', operator: '>=', value: '2025-01-01T00:00:00' },
      { field: 'issuedDate', operator: '<=', value: '2026-10-24T23:59:59' },
    ],
    orderBy: [{ field: 'paymentId', direction: 'ASC' }],
  });

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_payment_shape_probe',
    persisted: false,
    calls: 2,
    ...describeLaudusPayloadShape(payload),
  });
}
