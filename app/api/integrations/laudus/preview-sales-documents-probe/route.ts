export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudus } from '@/lib/integrations/laudus/client';

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

  const payload = await getLaudus('/DTE/pending');
  const rows = rowsFrom(payload);
  const sample = rows.slice(0,3).map((row) => ({
    docTypeId: row.docTypeId ?? null,
    docTypeName: row.docTypeName ?? null,
    docNumber: row.docNumber ?? null,
    issuedDate: row.issuedDate ?? null,
    total: row.total ?? null,
    documentStatus: row.documentStatus ?? null,
    hasCustomerId: row.customerId != null,
    hasCustomerVatId: row.customerVATId != null,
    hasTrackId: row.trackId != null,
  }));

  return NextResponse.json({
    ok:true,
    persisted:false,
    authenticatedLaudusCalls:1,
    endpoint:'/DTE/pending',
    rows:rows.length,
    sample,
  });
}
