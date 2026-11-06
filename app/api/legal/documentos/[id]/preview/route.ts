export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

import { inflateRawSync } from 'node:zlib';
import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const MAX_PREVIEW_BYTES = 12 * 1024 * 1024;

function extractZipEntry(buffer: Buffer, targetName: string): Buffer | null {
  const eocdSignature = 0x06054b50;
  const centralSignature = 0x02014b50;
  const localSignature = 0x04034b50;
  const minOffset = Math.max(0, buffer.length - 65_557);
  let eocd = -1;

  for (let offset = buffer.length - 22; offset >= minOffset; offset -= 1) {
    if (buffer.readUInt32LE(offset) === eocdSignature) {
      eocd = offset;
      break;
    }
  }
  if (eocd < 0) return null;

  let cursor = buffer.readUInt32LE(eocd + 16);
  while (cursor + 46 <= buffer.length && buffer.readUInt32LE(cursor) === centralSignature) {
    const compressionMethod = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const fileNameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const localHeaderOffset = buffer.readUInt32LE(cursor + 42);
    const fileName = buffer
      .subarray(cursor + 46, cursor + 46 + fileNameLength)
      .toString('utf8');

    if (fileName === targetName) {
      if (
        localHeaderOffset + 30 > buffer.length ||
        buffer.readUInt32LE(localHeaderOffset) !== localSignature
      ) {
        return null;
      }
      const localNameLength = buffer.readUInt16LE(localHeaderOffset + 26);
      const localExtraLength = buffer.readUInt16LE(localHeaderOffset + 28);
      const dataStart = localHeaderOffset + 30 + localNameLength + localExtraLength;
      const dataEnd = dataStart + compressedSize;
      if (dataEnd > buffer.length) return null;
      const compressed = buffer.subarray(dataStart, dataEnd);
      if (compressionMethod === 0) return Buffer.from(compressed);
      if (compressionMethod === 8) return inflateRawSync(compressed);
      return null;
    }

    cursor += 46 + fileNameLength + extraLength + commentLength;
  }

  return null;
}

function decodeXmlEntities(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

function docxTextPreview(buffer: Buffer) {
  const xml = extractZipEntry(buffer, 'word/document.xml');
  if (!xml) return null;

  const text = decodeXmlEntities(
    xml
      .toString('utf8')
      .replace(/<w:tab\b[^>]*\/?\s*>/g, '\t')
      .replace(/<w:br\b[^>]*\/?\s*>/g, '\n')
      .replace(/<\/w:p>/g, '\n')
      .replace(/<[^>]+>/g, '')
  )
    .replace(/\r/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  return text || null;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_MODULO);
  if (!access.authorized) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  }

  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'Documento inválido' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from('module_documents')
    .select('id,document_name,document_type,file_path,file_url,file_size_bytes')
    .eq('id', id)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const type = String(doc.document_type || doc.document_name.split('.').pop() || '').toLowerCase();

  if (['pdf', 'png', 'jpg', 'jpeg', 'webp', 'gif'].includes(type)) {
    if (doc.file_url) {
      return NextResponse.json({ kind: type === 'pdf' ? 'pdf' : 'image', url: doc.file_url });
    }
    if (!doc.file_path) return NextResponse.json({ kind: 'unavailable' });

    const { data: signed, error: signedError } = await supabase.storage
      .from('module-documents')
      .createSignedUrl(doc.file_path, 900);
    if (signedError || !signed?.signedUrl) {
      return NextResponse.json({ error: 'No fue posible abrir el archivo' }, { status: 503 });
    }
    return NextResponse.json({
      kind: type === 'pdf' ? 'pdf' : 'image',
      url: signed.signedUrl,
    });
  }

  if (type === 'docx') {
    if (!doc.file_path) return NextResponse.json({ kind: 'unavailable' });
    if (Number(doc.file_size_bytes || 0) > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ kind: 'unavailable', reason: 'Archivo demasiado grande para previsualización' });
    }

    const { data: blob, error: downloadError } = await supabase.storage
      .from('module-documents')
      .download(doc.file_path);
    if (downloadError || !blob) {
      return NextResponse.json({ error: 'No fue posible leer el documento' }, { status: 503 });
    }

    const bytes = Buffer.from(await blob.arrayBuffer());
    if (bytes.length > MAX_PREVIEW_BYTES) {
      return NextResponse.json({ kind: 'unavailable', reason: 'Archivo demasiado grande para previsualización' });
    }

    const text = docxTextPreview(bytes);
    if (!text) {
      return NextResponse.json({ kind: 'unavailable', reason: 'No se pudo extraer texto del DOCX' });
    }

    return NextResponse.json({
      kind: 'text',
      text: text.slice(0, 80_000),
      truncated: text.length > 80_000,
    });
  }

  return NextResponse.json({ kind: 'unavailable', reason: 'Formato sin previsualización interna' });
}
