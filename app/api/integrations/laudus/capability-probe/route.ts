export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';

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

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
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
