export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data','items','results','rows']) {
    if (Array.isArray(record[key])) return (record[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  return [];
}

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'probe/laudus-sales-documents-20261103';
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = [
    'salesInvoiceId','invoiceId','docNumber','issuedDate','dueDate',
    'docTypeId','docTypeName','total','totals.total',
    'customerId','customer.customerId','customer.VATId',
    'documentStatus','trackId',
  ];

  const fields: Record<string, unknown> = {};
  for (const field of candidates) {
    try {
      const payload = await listLaudus('/sales/invoices/list',{
        options:{offset:0,limit:1},
        fields:[field],
      });
      const rows=rowsFrom(payload);
      const value=rows[0]?.[field];
      fields[field]={
        status:'ok',
        rows:rows.length,
        valueType:value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value,
        returnedKeys:rows[0] ? Object.keys(rows[0]).slice(0,12) : [],
      };
    } catch (error) {
      fields[field]={
        status:'failed',
        upstreamStatus:typeof (error as any)?.status === 'number' ? (error as any).status : null,
      };
    }
  }

  return NextResponse.json({
    ok:true,
    persisted:false,
    endpoint:'/sales/invoices/list',
    candidateCalls:candidates.length,
    fields,
  });
}
