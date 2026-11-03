export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { loadLaudusAccountingReadiness } from '@/lib/integrations/laudus/accounting-readiness';

export async function GET() {
  const allowed =
    process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'optimize/laudus-session-budget-20261102';

  if (!allowed) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const db = await createClient();
  const { data: source, error } = await db
    .from('laudus_source_status_service_v1')
    .select('organization_id')
    .eq('enabled', true)
    .limit(1)
    .maybeSingle();

  if (error || !source?.organization_id) {
    return NextResponse.json({ ok: false, stage: 'organization' }, { status: 503 });
  }

  try {
    const result = await loadLaudusAccountingReadiness(db, String(source.organization_id));
    return NextResponse.json({
      ok: true,
      ledgerRows: result.ledger.total,
      financeAssets: result.assets.finance,
      canonicalAssets: result.assets.canonical,
      reconciliationState: result.reconciliation.state,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message.slice(0, 300) : 'unknown';
    return NextResponse.json({ ok: false, stage: 'accounting-readiness', message }, { status: 500 });
  }
}
