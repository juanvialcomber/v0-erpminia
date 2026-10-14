import { createHash } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function POST(request: NextRequest) {
  const ctx = await getOrganizationContext(request);
  if (!ctx.ok) return ctx.response;
  if (!['admin', 'superadmin'].includes(String(ctx.role || '').toLowerCase())) {
    return NextResponse.json({ error: 'Solo administración puede verificar archivos HSE' }, { status: 403 });
  }
  const prefix = 'prevencion/documentos-hse/';
  const body = await request.json().catch(() => ({}));
  const offset = Number(body?.offset ?? 0);
  const limit = Number(body?.limit ?? 10);
  if (!Number.isInteger(offset) || offset < 0 || offset > 1000 || !Number.isInteger(limit) || limit < 1 || limit > 10) {
    return NextResponse.json({ error: 'Lote inválido' }, { status: 400 });
  }
  const { data: records, error: listError } = await ctx.supabase.from('module_documents')
    .select('id,file_path').eq('organization_id', ctx.organizationId)
    .like('file_path', prefix + '%').order('file_path').range(offset, offset + limit - 1);
  if (listError) return NextResponse.json({ error: 'No se pudo consultar el inventario HSE' }, { status: 502 });
  const items = [];
  for (const record of records || []) {
    const path = String(record.file_path || '');
    if (!path.startsWith(prefix) || path.includes('..')) continue;
    const { data, error } = await ctx.supabase.storage.from('module-documents').download(path);
    if (error || !data) { items.push({ extension: path.split('.').pop(), status: 'download_error' }); continue; }
    if (data.size > 12 * 1024 * 1024) { items.push({ extension: path.split('.').pop(), status: 'too_large' }); continue; }
    const buffer = Buffer.from(await data.arrayBuffer());
    items.push({ extension: path.split('.').pop(), bytes: buffer.length,
      sha256: createHash('sha256').update(buffer).digest('hex'), status: 'verified_bytes' });
  }
  return NextResponse.json({ scope: 'motil_hse', returned: items.length, items,
    offset, has_more: (records || []).length === limit, mutates_data: false },
    { headers: { 'Cache-Control': 'no-store' } });
}
