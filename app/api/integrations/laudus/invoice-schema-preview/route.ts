export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { getLaudus } from '@/lib/integrations/laudus/client';

function nestedKeys(value: unknown, prefix = '', depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 3) return [];
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object');
    return first ? nestedKeys(first, prefix ? `${prefix}[]` : '[]', depth + 1) : [];
  }
  const record = value as Record<string, unknown>;
  const keys: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);
    if (child && typeof child === 'object') keys.push(...nestedKeys(child, path, depth + 1));
  }
  return keys;
}

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const payload = await getLaudus('/purchases/invoices/49354');
  return NextResponse.json({
    source: 'Laudus',
    readOnly: true,
    valuesExposed: false,
    keys: Array.from(new Set(nestedKeys(payload))).sort().slice(0, 400),
  });
}
