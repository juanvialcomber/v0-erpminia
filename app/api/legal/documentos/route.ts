export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_MODULO);
  if (!access.authorized) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const search = (searchParams.get('search') || '').trim();
  const status = (searchParams.get('status') || '').trim();

  const supabase = getSupabaseServerClient();
  let query = supabase
    .from('module_documents')
    .select([
      'id',
      'document_name',
      'document_type',
      'document_type_category',
      'document_code',
      'description',
      'status',
      'file_path',
      'file_url',
      'file_size_bytes',
      'uploaded_at',
      'uploaded_by',
      'valid_from',
      'valid_until',
      'version',
      'l1_status',
      'l1_observations',
      'l2_status',
      'l2_observations',
      'canonical_section',
      'provenance_status',
      'canonical_role',
      'extracted_data',
    ].join(','))
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .is('deleted_at', null)
    .order('uploaded_at', { ascending: false });

  if (search) query = query.ilike('document_name', `%${search}%`);
  if (status) query = query.eq('status', status);

  const { data, error } = await query;
  if (error) {
    console.error('[legal/documentos GET]', error.message);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const uploaderIds = Array.from(new Set((data || []).map((doc) => doc.uploaded_by).filter(Boolean)));
  const { data: uploaders } = uploaderIds.length
    ? await supabase.from('profiles').select('id,full_name,email').in('id', uploaderIds)
    : { data: [] as Array<{ id:string; full_name:string|null; email:string|null }> };

  const uploaderById = new Map((uploaders || []).map((row) => [row.id, row]));

  const documents = (data || []).map((doc) => {
    const uploader = uploaderById.get(doc.uploaded_by);
    const normalizedStatus =
      ['active', 'approved', 'aprobado'].includes(String(doc.status || '').toLowerCase())
        ? 'approved'
        : ['rejected', 'rechazado'].includes(String(doc.status || '').toLowerCase())
          ? 'rejected'
          : 'pending';

    return {
      id: doc.id,
      document_name: doc.document_name,
      document_type: doc.document_type || 'document',
      document_type_category: doc.document_type_category || 'Legal',
      document_code: doc.document_code || '',
      description: doc.description || '',
      status: doc.status || 'draft',
      review_state: normalizedStatus,
      file_url: doc.file_url || null,
      file_size_bytes: Number(doc.file_size_bytes || 0),
      uploaded_at: doc.uploaded_at,
      uploaded_by: uploader?.full_name || uploader?.email || 'Usuario MOTIL',
      uploaded_by_email: uploader?.email || null,
      valid_from: doc.valid_from,
      valid_until: doc.valid_until,
      version: Number(doc.version || 1),
      l1_status: doc.l1_status,
      l1_observations: doc.l1_observations,
      l2_status: doc.l2_status,
      l2_observations: doc.l2_observations,
      canonical_section: doc.canonical_section,
      provenance_status: doc.provenance_status,
      canonical_role: doc.canonical_role,
      extracted_data: doc.extracted_data || {},
      preview_url: `/api/legal/documentos/${doc.id}/preview`,
    };
  });

  return NextResponse.json({
    documents,
    total: documents.length,
    summary: {
      pending: documents.filter((doc) => doc.review_state === 'pending').length,
      approved: documents.filter((doc) => doc.review_state === 'approved').length,
      rejected: documents.filter((doc) => doc.review_state === 'rejected').length,
    },
    accessLevel: access.accessLevel,
  });
}
