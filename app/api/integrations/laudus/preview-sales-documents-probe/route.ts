export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'probe/laudus-sales-documents-20261103';
  if (!allowed) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const response = await fetch('https://api.laudus.cl/swagger/v2/swagger.json', {
    cache: 'no-store',
    headers: { accept: 'application/json' },
  });
  if (!response.ok) {
    return NextResponse.json({ ok:false, status:response.status }, { status:502 });
  }
  const spec = await response.json() as { paths?: Record<string, unknown> };
  const matches = Object.entries(spec.paths || {})
    .filter(([,value]) => JSON.stringify(value).includes('DTEPendingDto'))
    .map(([path,value]) => ({ path, contract:value }));

  const dtePaths = Object.entries(spec.paths || {})
    .filter(([path,value]) => /dte/i.test(path) || /DTE/i.test(JSON.stringify(value)))
    .map(([path,value]) => ({
      path,
      methods:Object.keys((value && typeof value === 'object') ? value as Record<string,unknown> : {}),
      summary: JSON.stringify(value).slice(0,1800),
    }));

  return NextResponse.json({
    ok:true,
    persisted:false,
    authenticatedLaudusCalls:0,
    pendingDtoMatches:matches,
    dtePathCount:dtePaths.length,
    dtePaths,
  });
}
