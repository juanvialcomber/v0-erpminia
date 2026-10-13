import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/api/auth-session';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export const dynamic = 'force-dynamic';

const BUCKET = 'module-documents';

// GET /api/carpeta-arranque/[id]/downloadslot=<slot_index>
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const auth = await resolveAuthContext(request);
  if (!auth) return NextResponse.json({ error: 'No autenticado' }, { status: 401 });

  const [legal, hse] = await Promise.all([
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.LEGAL_EECC),
    getModuleAccessLevel(auth.user.id, auth.role, MODULE_KEYS.HSE_DOCUMENTACION),
  ]);
  if (legal === 'SR' && hse === 'SR') return NextResponse.json({ error: 'Sin permiso de lectura documental' }, { status: 403 });
  const { id: carpetaId } = await params;
  const slotIndex = parseInt(request.nextUrl.searchParams.get('slot') || '0', 10);

  if (!slotIndex) {
    return NextResponse.json({ error: 'slot es requerido' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();

  // Associate the folder with a contractor in the caller's own organization.
  const { data: user, error: userError } = await supabase.from('users').select('organization_id').eq('id', auth.user.id).maybeSingle();
  if (userError || !user?.organization_id) return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  const { data: folder, error: folderError } = await supabase.from('carpetas_arranque').select('empresa_rut').eq('id', carpetaId).maybeSingle();
  if (folderError || !folder?.empresa_rut) return NextResponse.json({ error: 'Carpeta no disponible' }, { status: 404 });
  const { data: company, error: companyError } = await supabase.from('eecc').select('id').eq('organization_id', user.organization_id).eq('is_active', true).eq('rut', folder.empresa_rut).limit(1).maybeSingle();
  if (companyError || !company) return NextResponse.json({ error: 'Carpeta fuera de la organización' }, { status: 403 });

  const { data: doc, error } = await supabase
    .from('carpeta_documentos')
    .select('file_path, file_name')
    .eq('carpeta_id', carpetaId)
    .eq('slot_index', slotIndex)
    .maybeSingle();

  if (error || !doc || !doc.file_path) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const { data: signedData, error: signError } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(doc.file_path, 300); // 5-minute signed URL

  if (signError || !signedData.signedUrl) {
    return NextResponse.json({ error: 'Error al generar URL de descarga' }, { status: 500 });
  }

  return NextResponse.json({ url: signedData.signedUrl, file_name: doc.file_name });
}
