import { NextResponse } from 'next/server';
import { getLaudus } from '@/lib/integrations/laudus/client';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PRODUCTS = [
  ['1484','COMBUSTIBLE001'],
  ['2609','VIVERES 0225'],
  ['2622','VIVERES 0238'],
  ['4436','SOLDADURA053'],
  ['1453','SONDAJE0429'],
  ['4944','LUBRICANTE038'],
] as const;

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data','items','results','rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
    }
  }
  return [];
}

function text(value: unknown) {
  return value == null ? null : String(value).slice(0,160);
}
function numeric(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function dateValue(row: Record<string, unknown>) {
  return text(row.date ?? row.movementDate ?? row.documentDate ?? row.createdAt);
}
function resultingStock(row: Record<string, unknown>) {
  return numeric(row.stock ?? row.resultingStock ?? row.balance);
}
function quantity(row: Record<string, unknown>) {
  return numeric(row.quantity ?? row.qty ?? row.amount);
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null,{status:404});
  }

  const results = [];
  for (const [productId,sku] of PRODUCTS) {
    try {
      const payload = await getLaudus(`/production/products/${productId}/kardex`);
      const rows = rowsFrom(payload).slice(0,500);
      const normalized = rows.map((row) => ({
        id: text(row.movementId ?? row.id),
        date: dateValue(row),
        type: text(row.movementType ?? row.type),
        description: text(row.description),
        quantity: quantity(row),
        resultingStock: resultingStock(row),
      }));
      const dated = normalized.filter((row) => row.date).sort((a,b) => String(a.date).localeCompare(String(b.date)));
      const latest = [...dated].reverse().find((row) => row.resultingStock != null) || null;
      const typeCounts: Record<string,number> = {};
      for (const row of normalized) {
        const key = row.type || 'unknown';
        typeCounts[key] = (typeCounts[key] || 0) + 1;
      }
      results.push({
        productId,
        sku,
        movementCount: normalized.length,
        firstDate: dated[0]?.date || null,
        lastDate: dated.at(-1)?.date || null,
        latestResultingStock: latest?.resultingStock ?? null,
        latestQuantity: latest?.quantity ?? null,
        latestType: latest?.type ?? null,
        typeCounts,
      });
    } catch (error) {
      results.push({
        productId,
        sku,
        error: error instanceof Error ? error.message : 'kardex_unavailable',
      });
    }
  }

  return NextResponse.json({ok:true,results},{headers:{'cache-control':'no-store'}});
}
