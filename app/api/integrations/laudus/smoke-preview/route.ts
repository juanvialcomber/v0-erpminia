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

type MotilStockProduct = {
  part_code: string;
  part_name: string | null;
  canonical_product_id: string | null;
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

  return { rows, calls, exhausted, bounded: !exhausted };
}

async function readMotilStockProducts() {
  const supabase = getSupabaseServerClient();
  const pageSize = 1000;
  const maxPages = 20;
  const rows: MotilStockProduct[] = [];

  for (let page = 0; page < maxPages; page += 1) {
    const from = page * pageSize;
    const to = from + pageSize - 1;
    const { data, error } = await supabase
      .from('warehouse_stock')
      .select('part_code,part_name,canonical_product_id')
      .order('part_code', { ascending: true })
      .range(from, to);

    if (error) throw new Error(`No fue posible leer warehouse_stock: ${error.message}`);

    const pageRows = (data || []) as MotilStockProduct[];
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

    const stockProducts = await readMotilStockProducts();
    const stockByCode = new Map(stockProducts.map((p) => [p.part_code, p]));
    const matchedStockCodes = new Set<string>();

    let exactCodeMatches = 0;
    let exactNameMatches = 0;
    let linkedToCanonical = 0;
    const differences: Array<Record<string, unknown>> = [];
    const missingInMotilStock: Array<Record<string, unknown>> = [];

    for (const rawProduct of products.rows) {
      const product = rawProduct as LaudusProduct;
      const sku = String(product.SKU || '').trim();
      if (!sku) continue;

      const stock = stockByCode.get(sku);
      if (!stock) {
        if (missingInMotilStock.length < 20) {
          missingInMotilStock.push({
            productId: product.productId,
            SKU: sku,
            description: product.description,
            unitOfMeasure: product.unitOfMeasure,
          });
        }
        continue;
      }

      exactCodeMatches += 1;
      matchedStockCodes.add(sku);
      if (stock.canonical_product_id) linkedToCanonical += 1;

      if (normalized(product.description) === normalized(stock.part_name)) {
        exactNameMatches += 1;
      } else if (differences.length < 20) {
        differences.push({
          SKU: sku,
          laudusDescription: product.description,
          motilName: stock.part_name,
        });
      }
    }

    const motilStockOnly = stockProducts
      .filter((product) => !matchedStockCodes.has(product.part_code))
      .slice(0, 20)
      .map((product) => ({
        productCode: product.part_code,
        name: product.part_name,
        canonicalProductId: product.canonical_product_id,
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
        motilWarehouseStockRows: stockProducts.length,
        exactCodeMatches,
        exactNameMatches,
        fieldDifferences: exactCodeMatches - exactNameMatches,
        matchedLinkedToCanonical: linkedToCanonical,
        missingInMotilStock: products.rows.length - exactCodeMatches,
        motilStockOnly: stockProducts.length - matchedStockCodes.size,
        sampleDifferences: differences,
        sampleMissingInMotilStock: missingInMotilStock,
        sampleMotilStockOnly: motilStockOnly,
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
