export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { describeLaudusPayloadShape, LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

const TARGETS = [
  ['costCenters', '/purchases/costcenters/list'],
  ['payments', '/purchases/payments/list'],
  ['fixedAssets', '/purchases/fixedAssets/list'],
  ['accounts', '/accounting/accounts/list'],
  ['journalEntries', '/accounting/journal/entries/list'],
  ['banks', '/accounting/banks/list'],
  ['bankStatements', '/accounting/bankStatements/list'],
] as const;

function safeMetadata(payload: unknown) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return {};
  const record = payload as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .filter(([key, value]) => /count|total|rows/i.test(key) && (typeof value === 'number' || typeof value === 'string'))
      .slice(0, 10),
  );
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const results: Record<string, unknown> = {};
  let calls = 0;

  for (const [key, path] of TARGETS) {
    try {
      const payload = await listLaudus(path, { options: { offset: 0, limit: 5 } });
      calls += 1;
      results[key] = {
        status: 'ok',
        ...describeLaudusPayloadShape(payload),
        metadata: safeMetadata(payload),
      };
    } catch (error) {
      calls += 1;
      const laudusError = error instanceof LaudusApiError ? error : null;
      results[key] = {
        status: 'failed',
        upstreamStatus: laudusError?.status || null,
        upstreamCode: laudusError?.upstreamCode || null,
      };
    }
  }

  return NextResponse.json({
    status: 'ok',
    mode: 'read_only_preview_probe',
    persisted: false,
    calls,
    results,
  });
}
