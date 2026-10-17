export const dynamic = 'force-dynamic';

import {NextRequest,NextResponse} from 'next/server';
import {getOrganizationContext} from '@/lib/api/organization-context';
import {MODULE_KEYS,requireModuleAccess} from '@/lib/api/module-access';
import {groupPermittedForMode,validSourceMode} from
  '@/lib/messages/whatsapp-operational-projection.mjs';
import type {WhatsappActivityMode} from '@/lib/messages/whatsapp-operational-projection.mjs';

const UUID=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
const MIME=new Set(['video/mp4','image/jpeg','image/png','image/webp']);
const noStore={'Cache-Control':'private, no-store','Referrer-Policy':'no-referrer'};

export async function GET(request:NextRequest,ctx:{params:Promise<{id:string}>}){
  const modeRaw=request.nextUrl.searchParams.get('mode')||'overview';
  if(!validSourceMode(modeRaw))return NextResponse.json({error:'Área inválida'},
    {status:400,headers:noStore});
  const mode:WhatsappActivityMode=modeRaw;
  const moduleKey=mode==='drilling'
    ?MODULE_KEYS.PROD_SONDAJE_PRODUCCION:MODULE_KEYS.PROD_OPERACIONES;
  const access=await requireModuleAccess(request,moduleKey);
  if(!access.authorized)return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok)return context.response;
  const {id}=await ctx.params;
  if(!UUID.test(id))return NextResponse.json({error:'Archivo inválido'},
    {status:400,headers:noStore});
  const db=context.supabase;
  const {data:file,error:fileError}=await db.from('motil_whatsapp_attachments')
    .select('id,group_id,mime_type,storage_path,download_status')
    .eq('organization_id',context.organizationId).eq('id',id).maybeSingle();
  if(fileError)return NextResponse.json({error:'Evidencia temporalmente no disponible'},
    {status:503,headers:noStore});
  if(!file||file.download_status!=='stored'||!MIME.has(file.mime_type||'')
      ||!file.storage_path?.startsWith(context.organizationId+'/'))
    return NextResponse.json({error:'Archivo no disponible'},
      {status:404,headers:noStore});

  const {data:group,error:groupError}=await db.from('motil_whatsapp_groups')
    .select('id,display_name,chat_id,enabled')
    .eq('organization_id',context.organizationId).eq('id',file.group_id)
    .eq('enabled',true).maybeSingle();
  if(groupError)return NextResponse.json({error:'Origen temporalmente no disponible'},
    {status:503,headers:noStore});
  if(!group||!groupPermittedForMode(group,mode))
    return NextResponse.json({error:'Evidencia de grupo no autorizado'},
      {status:404,headers:noStore});

  const {data:signed,error:signedError}=await db.storage
    .from('motil-whatsapp-evidence').createSignedUrl(file.storage_path,120);
  if(signedError||!signed?.signedUrl)
    return NextResponse.json({error:'No se pudo abrir la evidencia'},
      {status:503,headers:noStore});
  const response=NextResponse.redirect(signed.signedUrl);
  response.headers.set('Cache-Control','private, no-store');
  response.headers.set('Referrer-Policy','no-referrer');
  return response;
}
