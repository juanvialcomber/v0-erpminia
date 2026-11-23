import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

// Prevent static generation - this route needs runtime env vars
export const dynamic = 'force-dynamic';

const bulkUpdateSchema = z.object({
  documentIds: z.array(z.string().uuid()),
  tagsToAdd: z.array(z.string()).optional().default([]),
  tagsToRemove: z.array(z.string()).optional().default([]),
  module: z.string().default('prevención'),
});

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Configuración de Supabase no disponible' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const { documentIds, tagsToAdd, tagsToRemove, module } = bulkUpdateSchema.parse(body);
    const access = await requireDocumentModuleAccess(req, module, true);
    if (!access.authorized) return access.response;
    if (!access.organizationId) {
      return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
    }

    if (documentIds.length === 0) {
      return NextResponse.json({ error: 'No hay documentos seleccionados' }, { status: 400 });
    }

    if (tagsToAdd.length === 0 && tagsToRemove.length === 0) {
      return NextResponse.json({ error: 'No hay tags para actualizar' }, { status: 400 });
    }

    // Get current documents
    const { data: docs, error: fetchError } = await supabase
      .from('module_documents')
      .select('id, tags')
      .in('id', documentIds)
      .eq('organization_id', access.organizationId)
      .eq('module', module);

    if (fetchError) throw fetchError;

    // Update each document
    const updates = (docs || []).map((doc: { id: string; tags?: string[] | null }) => {
      let updatedTags = Array.isArray(doc.tags) ? [...doc.tags] : [];

      // Remove tags
      updatedTags = updatedTags.filter((tag: string) => !tagsToRemove.includes(tag));

      // Add tags (avoid duplicates)
      tagsToAdd.forEach((tag) => {
        if (!updatedTags.includes(tag)) {
          updatedTags.push(tag);
        }
      });

      return {
        id: doc.id,
        organization_id: access.organizationId,
        tags: updatedTags,
        updated_at: new Date().toISOString(),
      };
    });

    // Batch update
    const { error: updateError } = await supabase
      .from('module_documents')
      .upsert(updates, { onConflict: 'id' });

    if (updateError) throw updateError;

    return NextResponse.json(
      {
        success: true,
        updated: updates.length,
        tagsAdded: tagsToAdd,
        tagsRemoved: tagsToRemove,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[v0] Bulk update tags error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'La actualización masiva falló' }, { status: 500 });
  }
}
