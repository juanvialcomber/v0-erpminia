export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { runLaudusBankReconciliationSummary } from '@/lib/integrations/laudus/client';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  try {
    const result = await runLaudusBankReconciliationSummary();
    return NextResponse.json(result, {
      headers: { 'Cache-Control': 'no-store' },
    });
  } catch (error) {
    console.error('[laudus/bank-reconciliation]', error instanceof Error ? error.message : 'unknown error');
    return NextResponse.json(
      {
        status: 'unavailable',
        bankStatement: null,
        bankOnly: { count: 0, amount: 0, items: [] },
        journalOnly: { count: 0, amount: 0, items: [] },
        persisted: false,
      },
      { status: 502 },
    );
  }
}
