export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

// Read-only source queue. This endpoint must never create operational records.
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { data, error } = await context.supabase
    .from('motil_whatsapp_message_registry_v1')
    .select('message_id,group_id,group_name,sender_name,message_type,body,file_name,occurred_at,received_at,registry_state,activity_count,published_count,attachment_count,problematic_attachment_count')
    .eq('organization_id', context.organizationId)
    .neq('registry_state', 'operational_activity_registered')
    .order('received_at', { ascending: false })
    .limit(100);

  if (error) {
    console.error('[motil/whatsapp/review-queue] Query failed', error.code);
    return NextResponse.json({ error: 'No fue posible cargar la bandeja de revisión' }, { status: 503 });
  }

  return NextResponse.json({
    items: (data || []).map((row) => ({
      ...row,
      review_required: true,
      suggested_destination: null,
      publication_allowed: false,
    })),
    read_only: true,
    next_action: 'Clasificar por remitente, grupo y contenido; validar con responsable antes de publicar.',
  });
}
