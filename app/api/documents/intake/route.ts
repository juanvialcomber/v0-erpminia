import { NextRequest, NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';
import { requireAdmin } from '@/lib/api/guard';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const BUCKET = 'document-intake';
const MAX_FILE_SIZE = 50 * 1024 * 1024;

const SOURCE_LABELS = new Set(['manual_upload', 'windows_server', 'laudus', 'area_upload', 'other']);

function sanitizeSegment(value: string, fallback = 'general') {
  const normalized = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9._-]/gi, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .toLowerCase();
  return normalized || fallback;
}

function isSha256(value: string) {
  return /^[a-f0-9]{64}$/i.test(value);
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.authorized || !admin.user || !admin.organizationId) {
    return admin.response || NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const auth = { user: admin.user, organizationId: admin.organizationId };

  const supabase = getSupabaseServerClient();
  const { data, error } = await supabase
    .from('document_intake_items')
    .select('id, original_name, file_size_bytes, source, area, status, sha256, created_at')
    .eq('organization_id', auth.organizationId)
    .order('created_at', { ascending: false })
    .limit(50);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const items = data || [];
  const stats = items.reduce(
    (acc, item) => {
      acc.total += 1;
      if (item.status === 'pending_classification') acc.pending += 1;
      if (item.status === 'classified' || item.status === 'linked') acc.processed += 1;
      return acc;
    },
    { total: 0, pending: 0, processed: 0 },
  );

  return NextResponse.json({ items, stats });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin.authorized || !admin.user || !admin.organizationId) {
    return admin.response || NextResponse.json({ error: 'No autorizado.' }, { status: 401 });
  }
  const auth = { user: admin.user, organizationId: admin.organizationId };

  const payload = await request.json().catch(() => null);
  if (!payload || typeof payload !== 'object') {
    return NextResponse.json({ error: 'Solicitud inválida.' }, { status: 400 });
  }

  const action = String(payload.action || '');
  const supabase = getSupabaseServerClient();

  if (action === 'prepare') {
    const originalName = String(payload.originalName || '').trim();
    const mimeType = String(payload.mimeType || '').trim() || 'application/octet-stream';
    const fileSize = Number(payload.fileSize || 0);
    const sha256 = String(payload.sha256 || '').trim().toLowerCase();
    const source = String(payload.source || 'manual_upload').trim();
    const area = String(payload.area || 'general').trim();
    const sourcePath = String(payload.sourcePath || '').trim();

    if (!originalName || !Number.isFinite(fileSize) || fileSize <= 0 || fileSize > MAX_FILE_SIZE || !isSha256(sha256)) {
      return NextResponse.json({ error: 'Nombre, tamaño o hash inválido. Máximo 50 MB por archivo.' }, { status: 400 });
    }

    if (!SOURCE_LABELS.has(source)) {
      return NextResponse.json({ error: 'Fuente documental inválida.' }, { status: 400 });
    }

    const { data: duplicate, error: duplicateError } = await supabase
      .from('document_intake_items')
      .select('id, original_name, status, created_at')
      .eq('organization_id', auth.organizationId)
      .eq('sha256', sha256)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (duplicateError) {
      return NextResponse.json({ error: duplicateError.message }, { status: 500 });
    }

    if (duplicate) {
      return NextResponse.json(
        { error: 'Este archivo ya fue recibido anteriormente.', duplicate: true, existing: duplicate },
        { status: 409 },
      );
    }

    const day = new Date().toISOString().slice(0, 10);
    const path = [
      '00_inbox',
      day,
      sanitizeSegment(source),
      sanitizeSegment(area),
      `${randomUUID()}_${sanitizeSegment(originalName, 'documento')}`,
    ].join('/');

    const { data: signed, error: signedError } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(path);

    if (signedError || !signed?.token) {
      return NextResponse.json({ error: signedError?.message || 'No fue posible preparar la carga.' }, { status: 500 });
    }

    return NextResponse.json({
      bucket: BUCKET,
      path,
      token: signed.token,
      intake: {
        originalName,
        mimeType,
        fileSize,
        sha256,
        source,
        area,
        sourcePath,
      },
    });
  }

  if (action === 'confirm') {
    const path = String(payload.path || '').trim();
    const originalName = String(payload.originalName || '').trim();
    const mimeType = String(payload.mimeType || '').trim() || null;
    const fileSize = Number(payload.fileSize || 0);
    const sha256 = String(payload.sha256 || '').trim().toLowerCase();
    const source = String(payload.source || 'manual_upload').trim();
    const area = String(payload.area || 'general').trim();
    const sourcePath = String(payload.sourcePath || '').trim();

    if (!path.startsWith('00_inbox/') || !originalName || !isSha256(sha256) || fileSize <= 0 || fileSize > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Confirmación de carga inválida.' }, { status: 400 });
    }

    const { data: info, error: infoError } = await supabase.storage.from(BUCKET).info(path);
    if (infoError || !info) {
      return NextResponse.json({ error: 'El archivo aún no está disponible en Storage.' }, { status: 409 });
    }

    const storedSize = Number(info.size || 0);
    if (storedSize > 0 && storedSize !== fileSize) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: 'La carga quedó incompleta. Intenta nuevamente.' }, { status: 409 });
    }

    const { data: item, error: insertError } = await supabase
      .from('document_intake_items')
      .insert({
        organization_id: auth.organizationId,
        storage_bucket: BUCKET,
        storage_path: path,
        original_name: originalName,
        mime_type: mimeType,
        file_size_bytes: fileSize,
        sha256,
        source,
        area: area || null,
        source_path: sourcePath || null,
        status: 'pending_classification',
        metadata: {
          storage_etag: info.etag || null,
          storage_last_modified: info.lastModified || null,
        },
        uploaded_by: auth.user.id,
      })
      .select('id, original_name, status, created_at')
      .single();

    if (insertError) {
      await supabase.storage.from(BUCKET).remove([path]);
      return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    return NextResponse.json({ item });
  }

  return NextResponse.json({ error: 'Acción no soportada.' }, { status: 400 });
}
