export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { greenDb, GREEN_NO_STORE } from '@/lib/messages/greenapi';
import { isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';

// Source registry: every received message stays visible even before analysis.
// No canonical data writes, and never include disabled groups.
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId)
    return auth.response || NextResponse.json({ error: 'Sin permisos' }, { status: 403 });
  const db = greenDb();
  const { data: groups, error: groupError } = await db.from('motil_whatsapp_groups')
    .select('id,chat_id,enabled').eq('organization_id', auth.organizationId).eq('enabled', true).limit(51);
  if (groupError || !groups || groups.length > 50)
    return NextResponse.json({ error: 'No se pudieron verificar los grupos' }, { status: 503, headers: GREEN_NO_STORE });
  const ids = groups.filter(g => !isExcludedMotilWhatsappGroup(g.chat_id)).map(g => g.id);
  if (!ids.length) return NextResponse.json({ messages: [], totalShown: 0 }, { headers: GREEN_NO_STORE });
  const { data, error } = await db.from('motil_whatsapp_message_registry_v1')
    .select('message_id,group_id,group_name,sender_name,message_type,body,occurred_at,received_at,activity_count,published_count,exception_count,attachment_count,stored_attachment_count,extracted_attachment_count,problematic_attachment_count,registry_state')
    .eq('organization_id', auth.organizationId).in('group_id', ids)
    .order('occurred_at', { ascending: false }).limit(80);
  if (error) return NextResponse.json({ error: 'No se pudo leer la trazabilidad de mensajes' }, { status: 503, headers: GREEN_NO_STORE });
  const { data: stillAllowed, error: checkError } = await db.from('motil_whatsapp_groups')
    .select('id,chat_id,enabled').eq('organization_id', auth.organizationId).in('id', ids).limit(51);
  if (checkError || !stillAllowed)
    return NextResponse.json({ error: 'No se pudo confirmar el acceso a los grupos' }, { status: 503, headers: GREEN_NO_STORE });
  const allowed = new Set(stillAllowed.filter(g => g.enabled && !isExcludedMotilWhatsappGroup(g.chat_id)).map(g => g.id));
  const messages = (data || []).filter(m => allowed.has(m.group_id));
  return NextResponse.json({ messages, totalShown: messages.length, limited: messages.length === 80 }, { headers: GREEN_NO_STORE });
}
