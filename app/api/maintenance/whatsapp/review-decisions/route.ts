import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { splitWhatsappReviewItems } from '@/lib/maintenance/whatsapp-review-items';

const roles = new Set(['superadmin','admin','operaciones-supervisor','jefe_mantencion']);

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (!roles.has(String(context.role || '').toLowerCase())) return NextResponse.json({ error: 'Sin permiso para revisar' }, { status: 403 });
  const payload = await request.json().catch(() => null);
  const messageId = Number(payload?.message_id);
  const itemIndex = Number(payload?.item_index);
  const decision = payload?.decision;
  const destination = payload?.destination_module;
  if (!Number.isSafeInteger(messageId) || messageId <= 0 || !Number.isSafeInteger(itemIndex) || itemIndex < 0 ||
      !['approved_for_review', 'discarded'].includes(decision) ||
      (decision === 'approved_for_review' && !['planta','mina','despacho','mantenimiento','bodega','laboratorio'].includes(destination))) {
    return NextResponse.json({ error: 'Solicitud inválida' }, { status: 400 });
  }
  const { data: message, error: messageError } = await context.supabase.from('motil_whatsapp_messages')
    .select('id,body,group_id,message_type').eq('organization_id', context.organizationId).eq('id', messageId).maybeSingle();
  if (messageError || !message) return NextResponse.json({ error: 'Mensaje no disponible' }, { status: 404 });
  const { data: group } = await context.supabase.from('motil_whatsapp_groups')
    .select('display_name').eq('organization_id',context.organizationId).eq('id',message.group_id).maybeSingle();
  const items = splitWhatsappReviewItems({
    message_id: messageId, body: message.body, group_name: group?.display_name || null,
    message_type: message.message_type, attachment_count: 0, problematic_attachment_count: 0,
  });
  const item = items[itemIndex];
  if (!item) return NextResponse.json({ error: 'Sección inválida o sin texto verificable' }, { status: 400 });
  const { data: existing, error: lookupError } = await context.supabase.from('motil_whatsapp_review_decisions')
    .select('id,decision,evidence_excerpt,destination_module')
    .eq('organization_id',context.organizationId).eq('message_id',messageId).eq('item_index',itemIndex).maybeSingle();
  if (lookupError) return NextResponse.json({ error: 'No se pudo verificar revisión previa' }, { status: 503 });
  if (existing) {
    const same = existing.evidence_excerpt === item.source_excerpt && existing.decision === decision &&
      existing.destination_module === (decision === 'discarded' ? null : destination);
    return NextResponse.json(same ? { id: existing.id, already_reviewed: true } : { error: 'La sección ya tiene una decisión; requiere revisión administrativa' }, { status: same ? 200 : 409 });
  }
  const { data: saved, error } = await context.supabase.from('motil_whatsapp_review_decisions')
    .insert({
      organization_id: context.organizationId, message_id: messageId, item_index: itemIndex,
      evidence_excerpt: item.source_excerpt, destination_module: decision === 'discarded' ? null : destination,
      decision, reviewer_id: context.userId,
    }).select('id').single();
  if (error) return NextResponse.json({ error: error.code === '23505' ? 'Ya existe una revisión de esta sección' : 'No fue posible guardar la revisión' }, { status: error.code === '23505' ? 409 : 503 });
  return NextResponse.json({ id: saved.id, saved: true, operational_publication: false });
}
