export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { suggestWhatsappReviewDestinations } from '@/lib/maintenance/whatsapp-review-routing';

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

  // Registry view stores the display alias, but not the stable sender ID.
  // Recover IDs from the source table within the same organization.
  const ids = (data || []).map((row) => row.message_id);
  const { data: senders, error: senderError } = ids.length
    ? await context.supabase
        .from('motil_whatsapp_messages')
        .select('id,sender_chat_id')
        .eq('organization_id', context.organizationId)
        .in('id', ids)
    : { data: [], error: null };
  if (senderError) {
    console.error('[motil/whatsapp/review-queue] Sender lookup failed', senderError.code);
    return NextResponse.json({ error: 'No fue posible verificar los remitentes' }, { status: 503 });
  }
  const senderByMessage = new Map((senders || []).map((sender) => [sender.id, sender.sender_chat_id]));

  return NextResponse.json({
    items: (data || []).map((row) => ({
      ...row,
      sender_chat_id: senderByMessage.get(row.message_id) || null,
      ...suggestWhatsappReviewDestinations(row),
      review_required: true,
    })),
    read_only: true,
    next_action: 'Clasificar por remitente, grupo y contenido; validar con responsable antes de publicar.',
  });
}
