import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

// Prevent static generation - this route needs runtime env vars
export const dynamic = 'force-dynamic';

const updateDocumentTagsSchema = z.object({
  documentId: z.string().uuid(),
  tags: z.array(z.string()),
  searchKeywords: z.string().optional(),
  module: z.string().default('prevención'),
});

export async function PUT(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Configuración de Supabase no disponible' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const { documentId, tags, searchKeywords, module } = updateDocumentTagsSchema.parse(body);
    const access = await requireDocumentModuleAccess(req, module, true);
    if (!access.authorized) return access.response;
    if (!access.organizationId) {
      return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
    }

    const { error } = await supabase
      .from('module_documents')
      .update({
        tags,
        search_keywords: searchKeywords || '',
        last_indexed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', documentId)
      .eq('organization_id', access.organizationId)
      .eq('module', module);

    if (error) throw error;

    return NextResponse.json(
      {
        success: true,
        documentId,
        tags,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[v0] Update document tags error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'La actualización falló' }, { status: 500 });
  }
}
