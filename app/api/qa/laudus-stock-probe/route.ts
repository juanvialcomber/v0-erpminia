export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudusStockSnapshot } from '@/lib/integrations/laudus/client';
import { toLaudusStockStageRows } from '@/lib/integrations/laudus/inventory';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not available.' }, { status: 404 });
  }

  const warehouseId = '001';
  try {
    const dateTo = new Date()
      .toLocaleString('sv-SE', { timeZone: 'America/Santiago', hour12: false })
      .replace(' ', 'T');
    const payload = await getLaudusStockSnapshot({ dateTo, warehouseId });
    const normalized = toLaudusStockStageRows(payload, warehouseId);
    return NextResponse.json({
      status: 'ok',
      warehouseId,
      rows: normalized.rows.length,
      dateTo: normalized.dateTo,
      sample: normalized.rows.slice(0, 3).map((row) => ({
        hasProductId: /^\d+$/.test(row.productId),
        hasSku: row.sku !== null,
        stockIsFinite: Number.isFinite(row.stock),
      })),
      persisted: false,
      canonicalInventoryMutated: false,
      laudusMutated: false,
    });
  } catch (error) {
    return NextResponse.json({
      status: 'failed',
      message: error instanceof Error ? error.message : 'unknown',
      persisted: false,
      canonicalInventoryMutated: false,
      laudusMutated: false,
    }, { status: 502 });
  }
}
