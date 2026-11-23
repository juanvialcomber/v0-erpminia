import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api/guard';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

export const dynamic = 'force-dynamic';

export async function DELETE(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (!auth.authorized || !auth.user || !auth.organizationId) {
      return NextResponse.json(
        { error: 'No autenticado. Inicia sesión nuevamente.' },
        { status: 401 }
      );
    }

    const documentId = request.nextUrl.searchParams.get('id');
    if (!documentId) {
      return NextResponse.json(
        { error: 'ID de documento requerido' },
        { status: 400 }
      );
    }

    const supabase = getSupabaseServerClient();

    const { data: document, error: fetchError } = await supabase
      .from('module_documents')
      .select('uploaded_by, organization_id, module')
      .eq('id', documentId)
      .eq('organization_id', auth.organizationId)
      .single();

    if (fetchError || !document) {
      return NextResponse.json(
        { error: 'Documento no encontrado' },
        { status: 404 }
      );
    }

    const moduleAccess = await requireDocumentModuleAccess(request, document.module, true);
    if (!moduleAccess.authorized) return moduleAccess.response;
    if (moduleAccess.organizationId !== auth.organizationId) {
      return NextResponse.json({ error: 'Documento fuera de la organización activa' }, { status: 404 });
    }

    // Owner or admin can delete
    const isAdmin = ['admin', 'superadmin', 'super_admin'].includes(String(auth.role || '').trim().toLowerCase());
    if (document.uploaded_by !== auth.user.id && !isAdmin) {
      return NextResponse.json(
        { error: 'No tienes permiso para eliminar este documento' },
        { status: 403 }
      );
    }

    const { error: deleteError } = await supabase
      .from('module_documents')
      .update({ is_active: false, deleted_at: new Date().toISOString() })
      .eq('id', documentId)
      .eq('organization_id', auth.organizationId);

    if (deleteError) {
      console.error('[v0] Delete error:', deleteError);
      return NextResponse.json(
        { error: `Error al eliminar documento: ${deleteError.message}` },
        { status: 500 }
      );
    }

    return NextResponse.json({
      message: 'Documento eliminado exitosamente',
      documentId,
    });
  } catch (error) {
    console.error('[v0] Delete error:', error);
    return NextResponse.json(
      { error: 'Error interno del servidor' },
      { status: 500 }
    );
  }
}
