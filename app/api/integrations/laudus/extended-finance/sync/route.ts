export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchLaudusExtendedFinanceSnapshot } from '@/lib/integrations/laudus/extended-finance';

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;

  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronización contable Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  try {
    const snapshot = await fetchLaudusExtendedFinanceSnapshot();
    const db = getSupabaseServerClient();

    const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
      p_organization_id: access.organizationId,
      p_accounting_entries: snapshot.journalEntries,
      p_bank_statements: snapshot.bankStatements,
      p_dtes: snapshot.dtesPending,
    });

    if (error) throw error;

    return NextResponse.json({
      status: snapshot.errors.length ? 'partial' : 'ok',
      source: 'Laudus',
      mode: 'read_only',
      calls: snapshot.calls,
      availableDomains: snapshot.availableDomains,
      upstreamErrors: snapshot.errors,
      journalEntriesRead: snapshot.journalEntries.length,
      bankStatementsRead: snapshot.bankStatements.length,
      dtesPendingRead: snapshot.dtesPending.length,
      result: data,
      canonicalMutated: false,
      laudusMutated: false,
    });
  } catch (error) {
    console.error('[laudus/extended-finance/sync]', error);
    return NextResponse.json(
      {
        status: 'partial',
        source: 'Laudus',
        mode: 'read_only',
        canonicalMutated: false,
        laudusMutated: false,
        error: 'No fue posible completar la lectura contable extendida de Laudus.',
      },
      { status: 500 },
    );
  }
}
