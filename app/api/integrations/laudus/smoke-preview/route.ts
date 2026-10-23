export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudusAccessToken, listLaudus } from '@/lib/integrations/laudus/client';

const EXPECTED_BRANCH = 'test/laudus-smoke-preview-20261023';

function asRows(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

async function readAllPages(
  path: string,
  fields: string[],
  orderField: string,
  maxPages: number,
) {
  const requestedPageSize = 500;
  const rows: unknown[] = [];
  let offset = 0;
  let calls = 0;
  let exhausted = false;

  for (let page = 0; page < maxPages; page += 1) {
    const payload = await listLaudus(path, {
      options: { offset, limit: requestedPageSize },
      fields,
      filterBy: [],
      orderBy: [{ field: orderField, direction: 'ASC' }],
    });
    calls += 1;

    const pageRows = asRows(payload);
    if (!pageRows.length) {
      exhausted = true;
      break;
    }

    rows.push(...pageRows);
    offset += pageRows.length;
  }

  return {
    rows,
    calls,
    exhausted,
    bounded: !exhausted,
  };
}

export async function GET() {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isExpectedBranch = process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;

  if (!isPreview || !isExpectedBranch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let calls = 0;

  try {
    await getLaudusAccessToken();
    calls += 1;

    const products = await readAllPages(
      '/production/products/list',
      ['productId', 'SKU', 'description', 'unitOfMeasure'],
      'productId',
      20,
    );
    calls += products.calls;

    let warehouses:
      | Awaited<ReturnType<typeof readAllPages>>
      | { rows: never[]; calls: number; exhausted: false; bounded: false; error: string };

    try {
      warehouses = await readAllPages(
        '/production/warehouses/list',
        ['warehouseId', 'name', 'address', 'county', 'city', 'state'],
        'warehouseId',
        5,
      );
      calls += warehouses.calls;
    } catch (error) {
      warehouses = {
        rows: [],
        calls: 0,
        exhausted: false,
        bounded: false,
        error: error instanceof Error ? error.message : 'Warehouse read failed.',
      };
    }

    return NextResponse.json({
      status: 'ok',
      authenticated: true,
      persisted: false,
      calls,
      products: {
        rowsRead: products.rows.length,
        exhausted: products.exhausted,
        bounded: products.bounded,
        first: products.rows.slice(0, 3),
        last: products.rows.slice(-3),
      },
      warehouses: {
        rowsRead: warehouses.rows.length,
        exhausted: warehouses.exhausted,
        bounded: warehouses.bounded,
        sample: warehouses.rows.slice(0, 10),
        ...('error' in warehouses ? { error: warehouses.error } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        persisted: false,
        calls,
        error: error instanceof Error ? error.message : 'Laudus master read failed.',
      },
      { status: 502 },
    );
  }
}
