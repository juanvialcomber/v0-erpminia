export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getLaudus, describeLaudusPayloadShape } from '@/lib/integrations/laudus/client';

function nestedKeys(value: unknown, prefix = '', depth = 0): string[] {
  if (!value || typeof value !== 'object' || depth > 2) return [];
  if (Array.isArray(value)) {
    const first = value.find((item) => item && typeof item === 'object');
    return first ? nestedKeys(first, prefix ? `${prefix}[]` : '[]', depth + 1) : [];
  }

  const record = value as Record<string, unknown>;
  const keys: string[] = [];
  for (const [key, child] of Object.entries(record)) {
    const path = prefix ? `${prefix}.${key}` : key;
    keys.push(path);
    if (child && typeof child === 'object') {
      keys.push(...nestedKeys(child, path, depth + 1));
    }
  }
  return keys;
}

export async function GET(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json({ error: 'Este diagnóstico requiere permisos de administración.' }, { status: 403 });
  }

  const invoiceId = Number(request.nextUrl.searchParams.get('invoiceId') || '');
  if (!Number.isInteger(invoiceId) || invoiceId <= 0) {
    return NextResponse.json({ error: 'invoiceId inválido.' }, { status: 400 });
  }

  const payload = await getLaudus(`/purchases/invoices/${invoiceId}`);

  return NextResponse.json({
    source: 'Laudus',
    readOnly: true,
    persisted: false,
    invoiceId,
    shape: describeLaudusPayloadShape(payload),
    keys: Array.from(new Set(nestedKeys(payload))).sort().slice(0, 250),
  });
}
