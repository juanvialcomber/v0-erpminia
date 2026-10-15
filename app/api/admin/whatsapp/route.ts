export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenConfigured, greenDb, greenInstance, greenRequest } from '@/lib/messages/greenapi';

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
    .select('id,chat_id,display_name,enabled,created_at').eq('organization_id',ctx.organizationId)
    .order('display_name').limit(100);
  if (error) return NextResponse.json({ error: 'No se pudieron consultar grupos. Comprueba la migración.' }, { status: 503 });
  const { data: recent, error: reportError } = await db.from('motil_whatsapp_daily_reports')
    .select('report_date,status,message_count,summary,findings,truncated,generated_at')
    .eq('organization_id',ctx.organizationId).order('report_date',{ascending:false}).limit(7);
  if (reportError) return NextResponse.json({ error: 'No se pudieron consultar los resúmenes.' }, { status: 503 });
  return NextResponse.json({ configured: greenConfigured(), groups: groups || [], reports: recent || [] }, { headers: GREEN_NO_STORE });
}
export async function POST(request: NextRequest) {
  const ctx = await context(request);
  if (!ctx.organizationId) return ctx.error;
  const body = await request.json().catch(()=>null);
  if (body?.action === 'discover') {
    if (!greenConfigured()) return NextResponse.json({ error: 'Configura primero GREENAPI_ID_INSTANCE, GREENAPI_API_TOKEN_INSTANCE y GREENAPI_WEBHOOK_TOKEN en Vercel.' }, { status: 503 });
    try {
      const result = await greenRequest('getChats');
      if (!Array.isArray(result)) throw new Error('Respuesta inesperada');
      return NextResponse.json({ groups: result.filter((g: any)=>/^\d{5,30}@g\.us$/.test(String(g.id||'')))
        .slice(0,100).map((g:any)=>({ chatId:String(g.id),name:String(g.name||g.id).slice(0,120) })) }, { headers:GREEN_NO_STORE });
    } catch (err) { return NextResponse.json({ error: err instanceof Error ? err.message : 'No se pudo consultar Green API' },{ status: 502 }); }
  }
  if (body?.action !== 'save') return NextResponse.json({ error: 'Acción inválida' }, { status: 400 });
  const chatId=String(body.chatId||''), name=String(body.name||'').trim();
  if (!/^\d{5,30}@g\.us$/.test(chatId) || !name || name.length>120 || typeof body.enabled!=='boolean') return NextResponse.json({ error:'Grupo inválido' },{status:400});
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
  // Verify provider membership before any group can be enabled.
  try {
    const chats = await greenRequest('getChats');
    if (!Array.isArray(chats) || !chats.some((c:any)=>c.id===chatId)) return NextResponse.json({ error:'El grupo no existe en esta instancia' },{status:400});
  } catch { return NextResponse.json({ error:'No se pudo comprobar el grupo en Green API' },{status:502}); }
  const {error} = await db.from('motil_whatsapp_groups').upsert({
    organization_id:ctx.organizationId, instance_id:instanceId,chat_id:chatId,display_name:name,
    enabled:true,updated_at:new Date().toISOString(),
  },{onConflict:'instance_id,chat_id'});
  if (error) return NextResponse.json({error:error.code==='23505'?'Grupo asignado a otra organización':'No se pudo guardar el grupo'},{status:error.code==='23505'?409:503});
  return NextResponse.json({ok:true,enabled:true},{headers:GREEN_NO_STORE});
}
