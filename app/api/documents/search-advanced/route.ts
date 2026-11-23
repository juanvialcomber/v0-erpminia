export const dynamic = 'force-dynamic';

import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { requireDocumentModuleAccess } from '@/lib/api/document-module-access';

const searchSchema = z.object({
  query: z.string().optional().default(''),
  tags: z.array(z.string()).optional().default([]),
  status: z.string().nullable().optional(),
  category: z.string().nullable().optional(),
  expiryFilter: z.enum(['all', 'active', 'expiring_30_days', 'expired']).optional().default('all'),
  page: z.number().int().positive().optional().default(1),
  pageSize: z.number().int().positive().max(100).optional().default(50),
  module: z.string().optional().default('prevención'),
});

type ModuleDocumentRow = {
  id: string;
  document_name?: string | null;
  category?: string | null;
  status?: string | null;
  tags?: string[] | null;
  file_path?: string | null;
  file_url?: string | null;
  created_at?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  document_code?: string | null;
  description?: string | null;
};

type SearchDocument = {
  id: string;
  document_name: string;
  category: string;
  status: string;
  tags: string[];
  daysUntilExpiry: number | null;
  expiryStatus: 'active' | 'expiring_soon' | 'expired';
  file_url: string;
  created_at: string;
};

function getDaysUntilExpiry(validUntil?: string | null) {
  if (!validUntil) return null;

  const diffMs = new Date(validUntil).getTime() - Date.now();
  return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
}

function getExpiryStatus(daysUntilExpiry: number | null): SearchDocument['expiryStatus'] {
  if (daysUntilExpiry === null) return 'active';
  if (daysUntilExpiry < 0) return 'expired';
  if (daysUntilExpiry <= 30) return 'expiring_soon';
  return 'active';
}

function normalizeText(value: string | null | undefined) {
  return (value || '').trim().toLowerCase();
}

export async function POST(req: NextRequest) {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceRoleKey) {
      return NextResponse.json({ error: 'Configuracion de Supabase no disponible' }, { status: 503 });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    const body = await req.json();
    const filters = searchSchema.parse(body);
    const access = await requireDocumentModuleAccess(req, filters.module);
    if (!access.authorized) return access.response;
    if (!access.organizationId) {
      return NextResponse.json({ error: 'Organización activa requerida' }, { status: 403 });
    }

    let query = supabase
      .from('module_documents')
      .select(
        'id, document_name, category, status, tags, file_path, file_url, created_at, valid_until, document_code, description'
      )
      .eq('organization_id', access.organizationId)
      .eq('module', filters.module)
      .eq('is_active', true)
      .order('created_at', { ascending: false });

    if (filters.category) {
      query = query.eq('category', filters.category);
    }

    if (filters.status) {
      query = query.eq('status', filters.status);
    }

    if (filters.tags.length > 0) {
      filters.tags.forEach((tag) => {
        query = query.contains('tags', [tag]);
      });
    }

    const { data, error } = await query.range(0, 9999);

    if (error) {
      console.error('[v0] Search query error:', error);
      return NextResponse.json({ error: `Error al buscar documentos: ${error.message}` }, { status: 500 });
    }

    const queryText = normalizeText(filters.query);
    const searched = ((data || []) as ModuleDocumentRow[])
      .map<SearchDocument>((doc) => {
        const daysUntilExpiry = getDaysUntilExpiry(doc.valid_until);
        return {
          id: doc.id,
          document_name: doc.document_name || '',
          category: doc.category || '',
          status: doc.status || 'draft',
          tags: Array.isArray(doc.tags) ? doc.tags : [],
          daysUntilExpiry,
          expiryStatus: getExpiryStatus(daysUntilExpiry),
          file_url: doc.file_url || '',
          created_at: doc.created_at || '',
        };
      })
      .filter((doc) => {
        if (!queryText) return true;

        const searchable = [
          doc.document_name,
          doc.category,
          doc.status,
          doc.tags.join(' '),
        ]
          .join(' ')
          .toLowerCase();

        return searchable.includes(queryText);
      })
      .filter((doc) => {
        if (filters.expiryFilter === 'all') return true;
        if (filters.expiryFilter === 'active') return doc.expiryStatus === 'active';
        if (filters.expiryFilter === 'expiring_30_days') return doc.expiryStatus === 'expiring_soon';
        if (filters.expiryFilter === 'expired') return doc.expiryStatus === 'expired';
        return true;
      });

    const total = searched.length;
    const totalPages = Math.max(1, Math.ceil(total / filters.pageSize));
    const page = Math.min(filters.page, totalPages);
    const start = (page - 1) * filters.pageSize;
    const end = start + filters.pageSize;

    return NextResponse.json({
      data: searched.slice(start, end),
      pagination: {
        page,
        pageSize: filters.pageSize,
        total,
        totalPages,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Parametros invalidos', details: error.errors }, { status: 400 });
    }

    console.error('[v0] Advanced search error:', error);
    return NextResponse.json({ error: 'No se pudo ejecutar la busqueda avanzada' }, { status: 500 });
  }
}
