export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchLaudusExtendedFinanceSnapshot } from '@/lib/integrations/laudus/extended-finance';

const QA_ORGANIZATION_ID = '2bd7fe06-8e4f-4a3a-b261-e3f5d8aa3dee';

const PATH_TERMS = [
  'journal',
  'voucher',
  'entry',
  'bankstatement',
  'electronic',
  'dte',
  'taxdocument',
  'document',
] as const;

const SCHEMA_TERMS = [
  'Journal',
  'Voucher',
  'Entry',
  'BankStatement',
  'Electronic',
  'Dte',
  'DTE',
  'TaxDocument',
] as const;

export async function GET(request: NextRequest) {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  if (request.nextUrl.searchParams.get('execute') === '1') {
    try {
      const snapshot = await fetchLaudusExtendedFinanceSnapshot();
      const db = getSupabaseServerClient();
      const { data, error } = await db.rpc('motil_ingest_laudus_extended_finance', {
        p_organization_id: QA_ORGANIZATION_ID,
        p_accounting_entries: snapshot.journalEntries,
        p_bank_statements: snapshot.bankStatements,
        p_dtes: snapshot.dtesPending,
      });
      if (error) throw error;

      return NextResponse.json({
        mode: 'preview_execution',
        source: 'Laudus',
        calls: snapshot.calls,
        journalEntriesRead: snapshot.journalEntries.length,
        bankStatementsRead: snapshot.bankStatements.length,
        dtesPendingRead: snapshot.dtesPending.length,
        result: data,
        rowsReturned: false,
        canonicalMutated: false,
        laudusMutated: false,
      });
    } catch (error) {
      const status =
        error && typeof error === 'object' && 'status' in error
          ? Number((error as { status?: unknown }).status) || null
          : null;
      return NextResponse.json(
        {
          mode: 'preview_execution',
          status,
          error: error instanceof Error ? error.message : 'Extended finance probe failed',
          rowsReturned: false,
          canonicalMutated: false,
          laudusMutated: false,
        },
        { status: 502 },
      );
    }
  }

  const response = await fetch('https://api.laudus.cl/swagger/v2/swagger.json', {
    cache: 'no-store',
  });
  if (!response.ok) {
    return NextResponse.json(
      { error: 'Swagger unavailable', status: response.status },
      { status: 502 },
    );
  }

  const document = (await response.json()) as {
    paths?: Record<string, Record<string, unknown>>;
    components?: { schemas?: Record<string, unknown> };
  };

  const paths = Object.entries(document.paths || {})
    .filter(([path, operations]) => {
      const haystack = (path + ' ' + JSON.stringify(operations)).toLowerCase();
      return PATH_TERMS.some((term) => haystack.includes(term));
    })
    .map(([path, operations]) => ({
      path,
      methods: Object.keys(operations).filter((key) =>
        ['get', 'post', 'put', 'patch', 'delete'].includes(key),
      ),
      summaries: Object.fromEntries(
        Object.entries(operations)
          .filter(([key]) => ['get', 'post', 'put', 'patch', 'delete'].includes(key))
          .map(([key, value]) => [
            key,
            value && typeof value === 'object' && 'summary' in value
              ? (value as { summary?: unknown }).summary
              : null,
          ]),
      ),
    }));

  const schemas = Object.entries(document.components?.schemas || {})
    .filter(([name]) => SCHEMA_TERMS.some((term) => name.includes(term)))
    .map(([name, schema]) => ({
      name,
      properties:
        schema && typeof schema === 'object' && 'properties' in schema
          ? Object.keys((schema as { properties?: Record<string, unknown> }).properties || {})
          : [],
    }));

  return NextResponse.json({
    mode: 'preview_swagger_probe',
    rowsReturned: false,
    laudusMutated: false,
    canonicalMutated: false,
    paths,
    schemas,
  });
}
