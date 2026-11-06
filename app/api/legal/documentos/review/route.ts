export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireModuleAccess, MODULE_KEYS } from '@/lib/api/module-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';

type ReviewRequestBody = {
  documentId?: string;
  docId?: string;
  action?: 'approve' | 'reject';
  observations?: string;
};

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.LEGAL_MODULO, true);
  if (!access.authorized) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible' }, { status: 403 });
  }

  const body = (await request.json().catch(() => null)) as ReviewRequestBody | null;
  const documentId = body?.documentId || body?.docId || '';
  const action = body?.action;
  const observations = String(body?.observations || '').trim();

  if (!/^[0-9a-f-]{36}$/i.test(documentId) || !action || !['approve', 'reject'].includes(action)) {
    return NextResponse.json({ error: 'Documento o acción inválidos' }, { status: 400 });
  }

  if (action === 'reject' && !observations) {
    return NextResponse.json({ error: 'Debes ingresar una observación para rechazar' }, { status: 400 });
  }

  const supabase = getSupabaseServerClient();
  const { data: current, error: currentError } = await supabase
    .from('module_documents')
    .select('id,document_name,status')
    .eq('id', documentId)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .is('deleted_at', null)
    .maybeSingle();

  if (currentError || !current) {
    return NextResponse.json({ error: 'Documento no encontrado' }, { status: 404 });
  }

  const normalizedCurrent = String(current.status || '').toLowerCase();
  if (action === 'approve' && ['active', 'approved', 'aprobado'].includes(normalizedCurrent)) {
    return NextResponse.json({ success: true, document: current, unchanged: true });
  }
  if (action === 'reject' && ['rejected', 'rechazado'].includes(normalizedCurrent)) {
    return NextResponse.json({ success: true, document: current, unchanged: true });
  }

  const now = new Date().toISOString();
  const updateData =
    action === 'approve'
      ? {
          status: 'active',
          l1_status: 'approved',
          l1_observations: observations || null,
          reviewed_by_l1: access.user.id,
          reviewed_at_l1: now,
          updated_at: now,
        }
      : {
          status: 'rejected',
          l1_status: 'rejected',
          l1_observations: observations,
          reviewed_by_l1: access.user.id,
          reviewed_at_l1: now,
          updated_at: now,
        };

  const { data, error } = await supabase
    .from('module_documents')
    .update(updateData)
    .eq('id', documentId)
    .eq('organization_id', access.organizationId)
    .eq('module', 'legal')
    .select('id,document_name,status,l1_status,l1_observations,reviewed_at_l1')
    .single();

  if (error) {
    return NextResponse.json({ error: 'No se pudo guardar la revisión' }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    document: data,
    decision: action,
  });
}
