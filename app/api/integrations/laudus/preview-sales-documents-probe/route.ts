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

function safeSample(rows: Record<string, unknown>[]) {
  return rows.slice(0,3).map((row) => {
    const out: Record<string, unknown> = { keys: Object.keys(row).slice(0,80) };
    for (const key of [
      'salesInvoiceId','salesWaybillId','receiptId','salesReceiptId',
      'docNumber','docTypeId','docTypeName','issuedDate','dueDate',
      'total','documentStatus','trackId'
    ]) {
      const value = row[key];
      if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' || value === null) out[key]=value;
    }
    return out;
  });
}

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'probe/laudus-sales-documents-20261103';
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const targets = [
    ['invoices','/sales/invoices/list'],
    ['waybills','/sales/waybills/list'],
    ['receipts','/sales/receipts/list'],
  ] as const;

  const results: Record<string, unknown> = {};
  for (const [key,path] of targets) {
    try {
      const payload = await listLaudus(path,{options:{offset:0,limit:3}});
      const rows=rowsFrom(payload);
      results[key]={status:'ok',rows:rows.length,sample:safeSample(rows)};
    } catch (error) {
      results[key]={
        status:'failed',
        message:error instanceof Error ? error.message : 'unknown',
        upstreamStatus: typeof (error as any)?.status === 'number' ? (error as any).status : null,
      };
    }
  }

  return NextResponse.json({ok:true,persisted:false,calls:3,results});
}
