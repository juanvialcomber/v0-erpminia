export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { historyMessage } from '@/lib/messages/greenapi-history';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenConfigured, greenDb, greenInstance, greenRequest } from '@/lib/messages/greenapi';
import { redactDisallowedWhatsappReports, isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';
import { isGreenApiGroupId, normalizeGreenApiGroupDiscovery } from '@/lib/messages/greenapi-group-discovery.mjs';

async function context(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) return { error: auth.response || NextResponse.json({ error: 'Sin permisos' }, { status: 403 }) };
  return { organizationId: auth.organizationId };
}
export async function GET(request: NextRequest) {
  const ctx = await context(request);
  if (!ctx.organizationId) return ctx.error;
  const db = greenDb();
  const { data: groups, error } = await db.from('motil_whatsapp_groups')
    .select('id,chat_id,display_name,enabled,updated_at,created_at,last_received_at').eq('organization_id',ctx.organizationId)
    .order('display_name').limit(100);
  if (error) return NextResponse.json({ error: 'No se pudieron consultar grupos. Comprueba la migración.' }, { status: 503 });
  const { data: recent, error: reportError } = await db.from('motil_whatsapp_daily_reports')
    .select('report_date,status,message_count,summary,findings,truncated,generated_at')
    .eq('organization_id',ctx.organizationId).order('report_date',{ascending:false}).limit(7);
  if (reportError) return NextResponse.json({ error: 'No se pudieron consultar los resúmenes.' }, { status: 503 });
  // Archived attachments remain stored, but never appear in an operational
  // evidence inbox once their group has been disabled. Resolve the allowlist
  // *before* limiting rows so disabled history cannot crowd out active sources.
  const activeGroupIds = (groups || []).filter(group => group.enabled && !isExcludedMotilWhatsappGroup(group.chat_id)).map(group => group.id);
  if (activeGroupIds.length > 50) {
    return NextResponse.json({ error: 'Demasiados grupos activos para esta consulta' },
      { status: 503, headers: GREEN_NO_STORE });
  }
  const { data: evidence, error: evidenceError } = activeGroupIds.length
    ? await db.from('motil_whatsapp_attachments')
        .select('id,group_id,message_id,download_status,scan_status,download_error_code,scan_error_code,mime_type,original_file_name,size_bytes,created_at,downloaded_at')
        .eq('organization_id',ctx.organizationId).in('group_id',activeGroupIds)
        .order('created_at',{ascending:false}).limit(60)
    : { data: [], error: null };
  const evidenceConfigured = !evidenceError;
  const reports = redactDisallowedWhatsappReports(recent || [], groups || []);
  return NextResponse.json({ configured: greenConfigured(), groups: (groups || []).filter(group => !isExcludedMotilWhatsappGroup(group.chat_id)),
    reports, evidence: evidence || [], evidenceConfigured,
    whatsappReviewEnabled: whatsappOperationalReviewEnabled() },
    { headers: GREEN_NO_STORE });
}
export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if (!ctx.organizationId) return ctx.error;
  const body = await request.json().catch(()=>null);
  if (body?.action === 'history') {
    const db = greenDb();
    const { data: group, error: groupError } = await db.from('motil_whatsapp_groups')
      .select('id,organization_id,chat_id,enabled').eq('organization_id', ctx.organizationId)
      .eq('instance_id', greenInstance()).eq('chat_id', String(body.chatId || ''))
      .eq('enabled', true).maybeSingle();
    if (groupError) return NextResponse.json({ error: 'No se pudo consultar el grupo' }, { status: 503 });
    if (!group) return NextResponse.json({ error: 'Grupo no habilitado para esta organización' }, { status: 403 });
    if (!greenConfigured()) return NextResponse.json({ error: 'Configuración incompleta' }, { status: 503 });
    try {
      const history = await greenRequest('getChatHistory', { chatId: group.chat_id, count: 100 });
      if (!Array.isArray(history)) throw new Error('Respuesta inesperada');
      const candidates = history.slice(0, 100).map(row => historyMessage(row, group)).filter(row => row !== null);
      const rows = [...new Map(candidates.map(row => [row.provider_message_id, row])).values()];
      // Recheck permission after the external request so disabling a group takes effect.
      const { data: current, error: currentError } = await db.from('motil_whatsapp_groups')
        .select('id').eq('id', group.id).eq('organization_id', ctx.organizationId)
        .eq('instance_id', greenInstance()).eq('enabled', true).maybeSingle();
      if (currentError) return NextResponse.json({ error: 'No se pudo verificar el grupo' }, { status: 503 });
      if (!current) return NextResponse.json({ error: 'El grupo fue desactivado' }, { status: 409 });
      let inserted = 0;
      if (rows.length) {
        const { data: saved, error: saveError } = await db.from('motil_whatsapp_messages')
          .upsert(rows, { onConflict: 'group_id,provider_message_id', ignoreDuplicates: true }).select('id');
        if (saveError) return NextResponse.json({ error: 'No se pudo guardar el historial; puedes reintentar sin duplicar' }, { status: 503 });
        inserted = saved?.length || 0;
      }
      return NextResponse.json({ inserted, existing: rows.length - inserted,
        skipped: Math.min(history.length, 100) - rows.length, fetched: Math.min(history.length, 100),
        limited: history.length >= 100 }, { headers: GREEN_NO_STORE });
    } catch (err) {
      const message = err instanceof Error && /^Proveedor HTTP \d{3}$/.test(err.message)
        ? err.message : 'No se pudo recuperar el historial de Green API';
      return NextResponse.json({ error: message }, { status: 502 });
    }
  }
  if (body?.action === 'discover') {
    if (!greenConfigured()) return NextResponse.json({ error: 'Configuración de GREEN-API incompleta.' }, { status: 503 });
    // GetChats follows recent chat activity. GetContacts?group=true is the
    // independent group-directory source; both may be temporarily incomplete.
    const [chatResult, contactResult] = await Promise.allSettled([
      greenRequest('getChats'),
      greenRequest('getContacts', { group: true }),
    ]);
    const chats = chatResult.status === 'fulfilled' && Array.isArray(chatResult.value) ? chatResult.value : null;
    const contacts = contactResult.status === 'fulfilled' && Array.isArray(contactResult.value) ? contactResult.value : null;
    if (!chats && !contacts) {
      console.error('[greenapi-discover] group sources unavailable', {
        chats: chatResult.status === 'rejected' ? 'request_failed' : 'invalid_response',
        contacts: contactResult.status === 'rejected' ? 'request_failed' : 'invalid_response',
      });
      return NextResponse.json({ error: 'GREEN-API no devolvió la lista de grupos. Intenta nuevamente.' }, { status: 502 });
    }
    const discovered = normalizeGreenApiGroupDiscovery(chats, contacts, 500);
    const allowedDiscovered = discovered.groups.filter(group => !isExcludedMotilWhatsappGroup(group.chatId));
    return NextResponse.json({
      ...discovered, groups: allowedDiscovered, total: allowedDiscovered.length,
      sources: { chats: Boolean(chats), contacts: Boolean(contacts) },
    }, { headers: GREEN_NO_STORE });
  }
  if (body?.action !== 'save') return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  const chatId=String(body.chatId||''), name=String(body.name||'').trim();
  if (isExcludedMotilWhatsappGroup(chatId)) return NextResponse.json({error:'Grupo excluido de MOTIL'},{status:403});
  if (!isGreenApiGroupId(chatId) || !name || name.length > 120 || typeof body.enabled !== 'boolean') {
    return NextResponse.json({ error: 'Grupo inválido' }, { status: 400 });
  }
  const instanceId=greenInstance();
  if (!/^\d{1,20}$/.test(instanceId)) return NextResponse.json({ error:'Configuración de instancia incompleta' },{status:503});
  const db=greenDb();
  const {data: existing, error: lookupError} = await db.from('motil_whatsapp_groups')
    .select('id,organization_id').eq('instance_id',instanceId).eq('chat_id',chatId).maybeSingle();
  if (lookupError) return NextResponse.json({error:'No se pudo consultar la configuración'},{status:503});
  if (existing && existing.organization_id!==ctx.organizationId) return NextResponse.json({error:'Grupo asignado a otra organización'},{status:409});

  // Disabling is fail-safe and must remain possible during provider outages or
  // after API credentials have been removed. Never create a disabled row.
  if (!body.enabled) {
    if (!existing) return NextResponse.json({ok:true,enabled:false},{headers:GREEN_NO_STORE});
    const {error} = await db.from('motil_whatsapp_groups').update({enabled:false,updated_at:new Date().toISOString()})
      .eq('id',existing.id).eq('organization_id',ctx.organizationId);
    if (error) return NextResponse.json({error:'No se pudo desactivar el grupo'},{status:503});
    return NextResponse.json({ok:true,enabled:false},{headers:GREEN_NO_STORE});
  }

  if (!greenConfigured()) return NextResponse.json({ error: 'Configuración incompleta' }, { status: 503 });
  // GetChats can omit inactive/older groups. Verify membership by exact ID
  // directly with Green API before permitting ingestion for this tenant.
  let verifiedName = name;
  try {
    const details = await greenRequest('getGroupData', { groupId: chatId });
    if (!details || typeof details !== 'object' || details.groupId !== chatId) {
      return NextResponse.json({ error: 'GREEN-API no confirmó la identidad del grupo.' }, { status: 409 });
    }
    verifiedName = String(details.subject || name).trim().slice(0, 120) || name;
  } catch {
    return NextResponse.json({
      error: 'GREEN-API no confirmó acceso a este grupo. Comprueba que el número conectado también sea participante.',
    }, { status: 502 });
  }
  const {error} = await db.from('motil_whatsapp_groups').upsert({
    organization_id:ctx.organizationId, instance_id:instanceId,chat_id:chatId,display_name:verifiedName,
    enabled:true,updated_at:new Date().toISOString(),
  },{onConflict:'instance_id,chat_id'});
  if (error) {
    // The original production constraint only accepts numeric@g.us while
    // Green API also returns numeric-numeric@g.us. Never remap the provider ID.
    if (error.code === '23514' && chatId.includes('-')) {
      console.warn('[greenapi-group-save] legacy group ID rejected by database schema');
      return NextResponse.json({
        error: 'No se pudo activar: la base de datos aún no admite el identificador de este grupo. Falta desplegar la migración de compatibilidad de WhatsApp.',
        code: 'WHATSAPP_SCHEMA_OUTDATED',
      }, { status: 503, headers: GREEN_NO_STORE });
    }
    console.warn('[greenapi-group-save] database rejected request', { code: error.code || 'unknown' });
    return NextResponse.json({
      error: error.code === '23505' ? 'Grupo asignado a otra organización' : 'No se pudo guardar el grupo. Revisa la configuración del servidor.',
      code: error.code === '23505' ? 'GROUP_TENANT_CONFLICT' : 'GROUP_SAVE_FAILED',
    }, { status: error.code === '23505' ? 409 : 503, headers: GREEN_NO_STORE });
  }
  return NextResponse.json({ok:true,enabled:true},{headers:GREEN_NO_STORE});
}
