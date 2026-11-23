export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

const BUCKET = 'module-documents';
const NO_STORE = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' };

export async function GET(request: NextRequest) {
  const access = await requireDocumentModuleAccess(request, 'legal');
  if (!access.authorized) return access.response;
  if (!access.organizationId) return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403, headers: NO_STORE });
  const supabase = await createClient();

  const { searchParams } = new URL(request.url);
  const id = searchParams.get('id');

  if (!id) {
    return NextResponse.json({ error: 'ID requerido' }, { status: 400, headers: NO_STORE });
  }

  // Fetch the document
  const { data: doc, error } = await supabase
    .from('module_documents')
    .select('id, document_name, file_path, file_url, module')
    .eq('id', id)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .is('deleted_at', null)
    .single();

  if (error || !doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404, headers: NO_STORE });
  }

  // Return existing file_url if already set
  if (doc.file_url) {
    return NextResponse.json({ url: doc.file_url }, { headers: NO_STORE });
  }

  // Generate signed URL from file_path
  if (!doc.file_path) {
    return NextResponse.json({ error: 'Archivo no disponible' }, { status: 404, headers: NO_STORE });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 3600);

  if (signedError || !signedData?.signedUrl) {
    console.error('[legal/download]', signedError?.message);
    return NextResponse.json({ error: 'No se pudo generar el enlace de descarga' }, { status: 500, headers: NO_STORE });
  }

  return NextResponse.json({ url: signedData.signedUrl, name: doc.document_name }, { headers: NO_STORE });
}
