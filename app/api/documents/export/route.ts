import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

// Prevent static generation - this route needs runtime env vars
export const dynamic = 'force-dynamic';

const exportSchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  documentIds: z.array(z.string().uuid()).optional(),
  filters: z.object({
    module: z.string().default('prevención'),
    status: z.string().optional(),
    category: z.string().optional(),
    tags: z.array(z.string()).optional(),
  }),
});

type ModuleDocumentExportRow = {
  id: string;
  document_name?: string | null;
  category?: string | null;
  status?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  tags?: string[] | null;
  version?: string | number | null;
  created_at?: string | null;
  file_url?: string | null;
};

function convertToCSV(data: ModuleDocumentExportRow[]): string {
  if (data.length === 0) return '';

  const headers = [
    'ID',
    'Nombre',
    'Categoría',
    'Estado',
    'Válido Desde',
    'Válido Hasta',
    'Tags',
    'Versión',
    'Creado',
    'URL',
  ];

  const rows = data.map((doc) => [
    doc.id,
    doc.document_name,
    doc.category,
    doc.status,
    doc.valid_from,
    doc.valid_until,
    (Array.isArray(doc.tags) ? doc.tags.join(';') : ''),
    doc.version,
    doc.created_at,
    doc.file_url,
  ]);

  const csvContent = [
    headers.join(','),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell || '').replace(/"/g, '""')}"`).join(',')
    ),
  ].join('\n');

  return csvContent;
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Configuración de Supabase no disponible' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const { format, documentIds, filters } = exportSchema.parse(body);
    const access = await requireDocumentModuleAccess(req, filters.module);
    if (!access.authorized) return access.response;
    if (!access.organizationId) {
      return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
    }

    // Build query
    let query = supabase
      .from('module_documents')
      .select(
        `id, document_name, category, status, 
         valid_from, valid_until, tags, version, 
         created_at, file_url`
      )
      .eq('organization_id', access.organizationId)
      .eq('module', filters.module);

    if (documentIds && documentIds.length > 0) {
      query = query.in('id', documentIds);
    }

    if (filters.status) query = query.eq('status', filters.status);
    if (filters.category) query = query.eq('category', filters.category);

    if (filters.tags && filters.tags.length > 0) {
      filters.tags.forEach((tag) => {
        query = query.contains('tags', `"${tag}"`);
      });
    }

    const { data, error } = await query;
    if (error) throw error;

    const exportData = (data || []) as ModuleDocumentExportRow[];

    if (format === 'csv') {
      const csv = convertToCSV(exportData);
      return new NextResponse(csv, {
        status: 200,
        headers: {
          'Content-Type': 'text/csv; charset=utf-8',
          'Content-Disposition': 'attachment; filename="documentos_hse.csv"',
        },
      });
    }

    return NextResponse.json(
      {
        format: 'json',
        totalDocuments: exportData.length,
        exportedAt: new Date().toISOString(),
        data: exportData,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[v0] Export error:', error);
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parámetros inválidos', details: error.errors }, { status: 400 });
    }
    return NextResponse.json({ error: 'La exportación falló' }, { status: 500 });
  }
}
