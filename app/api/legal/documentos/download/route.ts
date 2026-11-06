export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

const BUCKET = 'module-documents';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_MODULO);
  if (!access.authorized) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  }

  const id = new URL(request.url).searchParams.get('id') || '';
  if (!/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: 'ID inválido' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: doc, error } = await supabase
    .from('module_documents')
    .select('id,document_name,file_path,file_url,module')
    .eq('id', id)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .is('deleted_at', null)
    .maybeSingle();

  if (error || !doc) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  if (doc.file_url) {
    return NextResponse.json({ url: doc.file_url, name: doc.document_name });
  }

  if (!doc.file_path) {
    return NextResponse.json({ error: 'Archivo no disponible' }, { status: 404 });
  }

  const { data: signedData, error: signedError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 900);

  if (signedError || !signedData?.signedUrl) {
    return NextResponse.json({ error: 'No se pudo generar el enlace de descarga' }, { status: 500 });
  }

  return NextResponse.json({ url: signedData.signedUrl, name: doc.document_name });
}
