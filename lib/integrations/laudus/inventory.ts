export type LaudusStockListItemDto = {
  productId: number;
  sku: string | null;
  stock: number;
};

export type LaudusStockListDto = {
  dateTo: string | null;
  warehouseId: string | null;
  productCategoryId: string | null;
  products: LaudusStockListItemDto[];
};

export type LaudusStockStageRow = {
  productId: string;
  sku: string | null;
  stock: number;
};

function record(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`Laudus ${label} payload must be an object.`);
  }
  return value as Record<string, unknown>;
}

function nullableString(value: unknown) {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' && typeof value !== 'number') {
    throw new Error('Laudus string field has an unexpected type.');
  }
  const normalized = String(value).trim();
  return normalized || null;
}

function finiteNumber(value: unknown, label: string) {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Laudus ${label} must be numeric.`);
  return parsed;
}

function productId(value: unknown) {
  const parsed = finiteNumber(value, 'productId');
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error('Laudus productId must be a positive integer.');
  }
  return parsed;
}

export function parseLaudusStockList(payload: unknown): LaudusStockListDto {
  const root = record(payload, 'stock');
  if (!Array.isArray(root.products)) {
    throw new Error('Laudus stock payload is missing products[].');
  }

  const products = root.products.map((value, index) => {
    const row = record(value, `stock.products[${index}]`);
    return {
      productId: productId(row.productId),
      sku: nullableString(row.sku),
      stock: finiteNumber(row.stock, `stock.products[${index}].stock`),
    };
  });

  return {
    dateTo: nullableString(root.dateTo),
    warehouseId: nullableString(root.warehouseId),
    productCategoryId: nullableString(root.productCategoryId),
    products,
  };
}

export function toLaudusStockStageRows(
  payload: unknown,
  expectedWarehouseId: string,
): { dateTo: string | null; warehouseId: string; rows: LaudusStockStageRow[] } {
  const parsed = parseLaudusStockList(payload);
  const warehouseId = String(expectedWarehouseId || '').trim();
  if (!warehouseId) throw new Error('A Laudus warehouse id is required for stock staging.');

  if (parsed.warehouseId && parsed.warehouseId !== warehouseId) {
    throw new Error('Laudus stock response warehouse does not match the requested warehouse.');
  }

  return {
    dateTo: parsed.dateTo,
    warehouseId,
    rows: parsed.products.map((row) => ({
      productId: String(row.productId),
      sku: row.sku,
      stock: row.stock,
    })),
  };
}

export function chunkLaudusStockRows<T>(rows: T[], size = 500): T[][] {
  if (!Number.isInteger(size) || size < 1 || size > 500) {
    throw new Error('Laudus stock chunk size must be between 1 and 500.');
  }

  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) {
    chunks.push(rows.slice(index, index + size));
  }
  return chunks;
}
