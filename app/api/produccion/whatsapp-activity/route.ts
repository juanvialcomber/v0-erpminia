export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { projectWhatsappActivity, groupPermittedForMode, validSourceMode } from
  '@/lib/messages/whatsapp-operational-projection.mjs';
import type {WhatsappActivityMode} from '@/lib/messages/whatsapp-operational-projection.mjs';

const noStore={ 'Cache-Control':'private, no-store' };

export async function GET(request:NextRequest){
  const rawMode=request.nextUrl.searchParams.get('mode')||'overview';
  if(!validSourceMode(rawMode)) return NextResponse.json({error:'Área inválida'},
    {status:400,headers:noStore});
  const mode:WhatsappActivityMode=rawMode;
  const moduleKey=mode==='drilling'
    ? MODULE_KEYS.PROD_SONDAJE_PRODUCCION
    : mode==='maintenance'
      ? MODULE_KEYS.MANT_OPERACIONES
      : MODULE_KEYS.PROD_OPERACIONES;
  const auth=await requireModuleAccess(request,moduleKey);
  if(!auth.authorized)return auth.response;
  const ctx=await getOrganizationContext(request);
  if(!ctx.ok)return ctx.response;
  const db=ctx.supabase;

  const {data:groups,error:groupError}=await db.from('motil_whatsapp_groups')
    .select('id,display_name,chat_id,enabled')
    .eq('organization_id',ctx.organizationId).eq('enabled',true).limit(51);
  if(groupError||!groups||groups.length>50) return NextResponse.json({
    error:'No se pudieron comprobar las fuentes autorizadas'},
    {status:503,headers:noStore});
  const selected=groups.filter(g=>groupPermittedForMode(g,mode));
  if(!selected.length) return NextResponse.json(projectWhatsappActivity({mode}),
    {headers:noStore});
  const ids=selected.map(g=>g.id);
  // Bounded, tenant-scoped source reads. No OCR, binary or sensitive sender ID
  // crosses the API response. These messages are reported updates, not KPI.
  const [messagesResult,attachmentsResult]=await Promise.all([
    db.from('motil_whatsapp_messages')
      .select('id,group_id,sender_chat_id,body,message_type,occurred_at,received_at')
      .eq('organization_id',ctx.organizationId).in('group_id',ids)
      .order('occurred_at',{ascending:false}).limit(240),
    db.from('motil_whatsapp_attachments')
      .select('id,message_id,group_id,mime_type,download_status')
      .eq('organization_id',ctx.organizationId).in('group_id',ids)
      .eq('download_status','stored')
      .order('created_at',{ascending:false}).limit(220),
  ]);
  if(messagesResult.error||attachmentsResult.error) return NextResponse.json({
    error:'No se pudieron cargar las novedades de WhatsApp'},
    {status:503,headers:noStore});

  // Revalidate the allowlist after the source reads to prevent a deactivated
  // group from appearing in a recently cached query result.
  const {data:currentGroups,error:currentError}=await db.from('motil_whatsapp_groups')
    .select('id,display_name,chat_id,enabled')
    .eq('organization_id',ctx.organizationId).in('id',ids).limit(51);
  if(currentError||!currentGroups)return NextResponse.json({
    error:'No se pudo verificar la vigencia de los grupos'},
    {status:503,headers:noStore});
  const liveGroups=currentGroups.filter(g=>groupPermittedForMode(g,mode));
  const projected=projectWhatsappActivity({
    groups:liveGroups,messages:messagesResult.data||[],
    attachments:attachmentsResult.data||[],mode,limit:18,
  });
  return NextResponse.json({...projected,sourceLimitReached:
    (messagesResult.data?.length||0)>=240},
    {headers:noStore});
}
