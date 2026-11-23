import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

// Prevent static generation - this route needs runtime env vars
export const dynamic = 'force-dynamic';

// Predefined system tags
const SYSTEM_TAGS = {
  Tipo: ['Certificado', 'Reglamento', 'Procedimiento', 'Instructivo', 'Formulario', 'Guía', 'Estándar'],
  Riesgo: ['Bajo', 'Medio', 'Alto', 'Crítico'],
  Validez: ['Vigente', 'Próximo a Vencer', 'Vencido'],
  Versión: ['v1.0', 'v1.1', 'v2.0', 'v2.1'],
  Audiencia: ['Gerencia', 'Supervisores', 'Operarios', 'Todo el Personal'],
};

type DocumentTagsRow = {
  tags?: string[] | null;
};

export async function GET(req: NextRequest) {
  try {
    const module = req.nextUrl.searchParams.get('module') || 'prevención';
    const access = await requireDocumentModuleAccess(req, module);
    if (!access.authorized) return access.response;
    if (!access.organizationId) {
      return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json(
        {
          systemTags: SYSTEM_TAGS,
          userTags: [],
          module,
        },
        { status: 200 }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Get unique tags from database
    const { data: docs, error } = await supabase
      .from('module_documents')
      .select('tags')
      .eq('organization_id', access.organizationId)
      .eq('module', module)
      .not('tags', 'is', null);

    if (error) throw error;

    // Aggregate tags
    const uniqueTags = new Set<string>();
    (docs || []).forEach((doc: DocumentTagsRow) => {
      if (Array.isArray(doc.tags)) {
        doc.tags.forEach((tag: string) => uniqueTags.add(tag));
      }
    });

    return NextResponse.json(
      {
        systemTags: SYSTEM_TAGS,
        userTags: Array.from(uniqueTags).sort(),
        module,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[v0] Get tags error:', error);
    return NextResponse.json({ error: 'No se pudieron cargar los tags' }, { status: 500 });
  }
}
