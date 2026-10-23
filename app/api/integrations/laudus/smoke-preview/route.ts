export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudusAccessToken, listLaudus } from '@/lib/integrations/laudus/client';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const EXPECTED_BRANCH = 'test/laudus-smoke-preview-20261023';

type LaudusProduct = {
  productId?: number;
  SKU?: string;
  description?: string;
  unitOfMeasure?: string;
};

type CanonicalProduct = {
  product_code: string;
  name: string | null;
  description: string | null;
  unit: string | null;
};

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

function normalized(value: unknown) {
  return String(value ?? '')
    .normalize('NFKC')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('es');
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

async function readCanonicalProducts() {
  const supabase = getSupabaseServerClient();
  const pageSize = 1000;
  const maxPages = 20;
  const rows: CanonicalProduct[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .schema('canonical')
      .from('products')
      .select('product_code,name,description,unit')
      .order('product_code', { ascending: true })
      .range(from, to);

    if (error) throw new Error(`No fue posible leer canonical.products: ${error.message}`);

    const pageRows = (data || []) as CanonicalProduct[];
    rows.push(...pageRows);
    if (pageRows.length < pageSize) break;
  }

  return rows;
}

async function readMotilWarehouses() {
  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('warehouses')
    .select('code,name,address,status')
    .order('code', { ascending: true });

  if (error) throw new Error(`No fue posible leer warehouses: ${error.message}`);
  return data || [];
}

export async function GET() {
  const isPreview = process.env.VERCEL_ENV === 'preview';
  const isExpectedBranch = process.env.VERCEL_GIT_COMMIT_REF === EXPECTED_BRANCH;

  if (!isPreview || !isExpectedBranch) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let laudusCalls = 0;

  try {
    await getLaudusAccessToken();
    laudusCalls += 1;

    const products = await readAllPages(
      '/production/products/list',
      ['productId', 'SKU', 'description', 'unitOfMeasure'],
      'productId',
      40,
    );
    laudusCalls += products.calls;

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
      laudusCalls += warehouses.calls;
    } catch (error) {
      warehouses = {
        rows: [],
        calls: 0,
        exhausted: false,
        bounded: false,
        error: error instanceof Error ? error.message : 'Warehouse read failed.',
      };
    }

    const canonicalProducts = await readCanonicalProducts();
    const canonicalByCode = new Map(
      canonicalProducts.map((product) => [product.product_code, product]),
    );
    const matchedCanonicalCodes = new Set<string>();

    let exactCodeMatches = 0;
    let exactSemanticMatches = 0;
    const differences: Array<Record<string, unknown>> = [];
    const missingInMotil: Array<Record<string, unknown>> = [];

    for (const rawProduct of products.rows) {
      const product = rawProduct as LaudusProduct;
      const sku = String(product.SKU || '').trim();
      if (!sku) continue;

      const canonical = canonicalByCode.get(sku);
      if (!canonical) {
        if (missingInMotil.length < 20) {
          missingInMotil.push({
            productId: product.productId,
            SKU: sku,
            description: product.description,
            unitOfMeasure: product.unitOfMeasure,
          });
        }
        continue;
      }

      exactCodeMatches += 1;
      matchedCanonicalCodes.add(sku);

      const laudusDescription = normalized(product.description);
      const canonicalDescription = normalized(canonical.description || canonical.name);
      const laudusUnit = normalized(product.unitOfMeasure);
      const canonicalUnit = normalized(canonical.unit);

      if (
        laudusDescription === canonicalDescription &&
        laudusUnit === canonicalUnit
      ) {
        exactSemanticMatches += 1;
      } else if (differences.length < 20) {
        differences.push({
          SKU: sku,
          laudusDescription: product.description,
          motilDescription: canonical.description || canonical.name,
          laudusUnit: product.unitOfMeasure,
          motilUnit: canonical.unit,
        });
      }
    }

    const canonicalOnly = canonicalProducts
      .filter((product) => !matchedCanonicalCodes.has(product.product_code))
      .slice(0, 20)
      .map((product) => ({
        productCode: product.product_code,
        description: product.description || product.name,
        unit: product.unit,
      }));

    const motilWarehouses = await readMotilWarehouses();
    const motilWarehouseNames = new Set(
      motilWarehouses.map((warehouse) => normalized(warehouse.name)),
    );
    const warehouseNameMatches = warehouses.rows.filter((rawWarehouse) => {
      const warehouse = rawWarehouse as { name?: string };
      return motilWarehouseNames.has(normalized(warehouse.name));
    }).length;

    return NextResponse.json({
      status: 'ok',
      authenticated: true,
      persisted: false,
      laudusCalls,
      products: {
        laudusRows: products.rows.length,
        laudusExhausted: products.exhausted,
        laudusBounded: products.bounded,
        motilCanonicalRows: canonicalProducts.length,
        exactCodeMatches,
        exactSemanticMatches,
        fieldDifferences: exactCodeMatches - exactSemanticMatches,
        missingInMotil: products.rows.length - exactCodeMatches,
        canonicalOnly: canonicalProducts.length - matchedCanonicalCodes.size,
        sampleDifferences: differences,
        sampleMissingInMotil: missingInMotil,
        sampleCanonicalOnly: canonicalOnly,
        first: products.rows.slice(0, 3),
        last: products.rows.slice(-3),
      },
      warehouses: {
        laudusRows: warehouses.rows.length,
        laudusExhausted: warehouses.exhausted,
        motilRows: motilWarehouses.length,
        exactNameMatches: warehouseNameMatches,
        laudus: warehouses.rows,
        motil: motilWarehouses,
        ...('error' in warehouses ? { error: warehouses.error } : {}),
      },
    });
  } catch (error) {
    return NextResponse.json(
      {
        status: 'failed',
        persisted: false,
        laudusCalls,
        error: error instanceof Error ? error.message : 'Laudus reconciliation read failed.',
      },
      { status: 502 },
    );
  }
}
