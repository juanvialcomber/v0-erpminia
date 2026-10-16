export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { greenDb, GREEN_NO_STORE } from '@/lib/messages/greenapi';

export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) return auth.response ||
    NextResponse.json({error:'Sin permisos'},{status:403,headers:GREEN_NO_STORE});
  const {id} = await context.params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))
    return NextResponse.json({error:'ID inválido'},{status:400,headers:GREEN_NO_STORE});
  const db=greenDb();
  const {data,error}=await db.from('motil_whatsapp_attachments')
    .select('id,organization_id,group_id,message_id,download_status,scan_status,download_error_code,scan_error_code,mime_type,original_file_name,size_bytes,sha256,storage_path,extraction_json,scan_model,scan_schema_version,created_at,downloaded_at,scanned_at')
    .eq('organization_id',auth.organizationId).eq('id',id).maybeSingle();
  if(error) return NextResponse.json({error:'Error al consultar evidencia'},{status:503,headers:GREEN_NO_STORE});
  if(!data) return NextResponse.json({error:'Evidencia no encontrada'},{status:404,headers:GREEN_NO_STORE});
  // Archived groups must not contribute either detail/transcription or a new
  // signed file URL, even when an administrator knows the historical file ID.
  const {data:approvedGroup,error:groupError}=await db.from('motil_whatsapp_groups')
    .select('id').eq('id',data.group_id).eq('organization_id',auth.organizationId)
    .eq('enabled',true).maybeSingle();
  if(groupError) return NextResponse.json({error:'No se pudo verificar el grupo'},
    {status:503,headers:GREEN_NO_STORE});
  if(!approvedGroup) return NextResponse.json({error:'Evidencia de grupo no habilitado'},
    {status:404,headers:GREEN_NO_STORE});

  if(request.nextUrl.searchParams.get('file')==='1') {
    if(data.download_status!=='stored' || !data.storage_path ||
       !data.storage_path.startsWith(auth.organizationId+'/'))
      return NextResponse.json({error:'Archivo no disponible'},{status:404,headers:GREEN_NO_STORE});
    const {data:signed,error:signedError}=await db.storage.from('motil-whatsapp-evidence')
      .createSignedUrl(data.storage_path,120);
    if(signedError || !signed?.signedUrl)
      return NextResponse.json({error:'No se pudo autorizar el archivo'},{status:503,headers:GREEN_NO_STORE});
    const response=NextResponse.redirect(signed.signedUrl);
    response.headers.set('Cache-Control','no-store');
    response.headers.set('Referrer-Policy','no-referrer');
    return response;
  }
  // Include original message context, always filtered by the authenticated tenant and group.
  const {data:source,error:sourceError}=await db.from('motil_whatsapp_messages')
    .select('sender_name,body,occurred_at,received_at')
    .eq('organization_id',auth.organizationId).eq('group_id',data.group_id)
    .eq('id',data.message_id).maybeSingle();
  if(sourceError) return NextResponse.json({error:'No se pudo consultar el mensaje original'},
    {status:503,headers:GREEN_NO_STORE});
  const {storage_path,organization_id,...safe}=data;
  return NextResponse.json({evidence:safe,source:source?{
    sender_name:source.sender_name,
    body:typeof source.body==='string'?source.body.slice(0,4000):null,
    occurred_at:source.occurred_at,
    received_at:source.received_at,
  }:null},{headers:GREEN_NO_STORE});
}
