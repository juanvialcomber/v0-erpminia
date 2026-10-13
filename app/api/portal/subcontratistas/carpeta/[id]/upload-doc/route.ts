export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import {
  ensurePortalCarpeta,
  findMatchingEeccRecords,
  normalizeRutDigits,
  verifySubcontractorCookieValue,
} from '@/lib/subcontractor-session';

const BUCKET = 'module-documents';
const ALLOWED_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

const sanitize = (s: string) =>
  s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9.\-]/gi, '_').toLowerCase();

const normalizeText = (value: unknown) => String(value ?? '').trim().replace(/\s+/g, ' ');

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await verifySubcontractorCookieValue(
    request.cookies.get('subcontractor_token')?.value
  );
  if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 });

  const { id: carpetaId } = await params;
  const supabase = getSupabaseServerClient();
  const rut = normalizeRutDigits(session.user.rut);
  const eeccList = await findMatchingEeccRecords(supabase, rut);
  const eecc = eeccList.find((item) => item.is_active) || eeccList[0];
  const carpetaResult = await ensurePortalCarpeta(supabase, eecc, rut);

  if (!carpetaResult.carpeta) {
    return NextResponse.json(
      { error: carpetaResult.warning || 'No se pudo preparar la carpeta' },
      { status: 409 }
    );
  }

  if (carpetaResult.carpeta.id !== carpetaId) {
    return NextResponse.json({ error: 'Carpeta no autorizada' }, { status: 403 });
  }

  if (['aprobado', 'en_revision_l1', 'en_revision_l2'].includes(carpetaResult.carpeta.status)) {
    return NextResponse.json({ error: 'No se puede modificar una carpeta en revision o aprobada' }, { status: 400 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File;
  const slotIndex = Number.parseInt(String(formData.get('slot_index') ?? ''), 10);

  if (!file || !Number.isFinite(slotIndex) || slotIndex <= 0) {
    return NextResponse.json({ error: 'Archivo y slot_index son requeridos' }, { status: 400 });
  }

  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Tipo de archivo no permitido. Use PDF, Word o Excel.' }, { status: 400 });
  }

  if (file.size > 50 * 1024 * 1024) {
    return NextResponse.json({ error: 'El archivo supera el limite de 50MB' }, { status: 400 });
  }

  const { data: existingSlot } = await supabase
    .from('carpeta_documentos')
    .select('id, file_path, file_name, l1_status, l2_status')
    .eq('carpeta_id', carpetaId)
    .eq('slot_index', slotIndex)
    .maybeSingle();

  // Keep approved documents and earlier file versions immutable during correction.
  if (carpetaResult.carpeta.status === 'rechazado' && existingSlot?.l1_status !== 'no_cumple' && existingSlot?.l2_status !== 'no_cumple') {
    return NextResponse.json({ error: 'Solo puedes corregir documentos observados' }, { status: 409 });
  }
  const oldPath = existingSlot?.file_path || null;

  const timestamp = Date.now();
  const filePath = `carpetas/${sanitize(carpetaId)}/${slotIndex}_${timestamp}_${sanitize(file.name)}`;
  const buffer = await file.arrayBuffer();

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, { contentType: file.type, upsert: true });

  if (uploadError) {
    return NextResponse.json({ error: `Error al subir: ${uploadError.message}` }, { status: 500 });
  }

  const { data: doc, error: docError } = await supabase
    .from('carpeta_documentos')
    .update({
      file_name: normalizeText(file.name),
      file_path: uploadData.path,
      file_size_bytes: file.size,
      uploaded_by: session.user.session_id,
      uploaded_at: new Date().toISOString(),
      l1_status: null,
      l2_status: null,
      l1_observaciones: null,
      l2_observaciones: null,
      updated_at: new Date().toISOString(),
    })
    .eq('carpeta_id', carpetaId)
    .eq('slot_index', slotIndex)
    .select()
    .single();

  if (docError) {
    await supabase.storage.from(BUCKET).remove([uploadData.path]);
    return NextResponse.json({ error: docError.message }, { status: 500 });
  }

  // Old object intentionally retained for audit/recovery. Never delete a reviewed version.
  return NextResponse.json({ document: doc, previous_path: oldPath, message: 'Documento cargado exitosamente' });
}
