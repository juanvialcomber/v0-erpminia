import { NextRequest,NextResponse } from 'next/server';
import {requireModuleAccess,MODULE_KEYS} from '@/lib/api/module-access';
import {getSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
const rut=(v:unknown)=>String(v||'').replace(/[^0-9kK]/g,'').toUpperCase();
export async function GET(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.LEGAL_EECC);
 if(!access.authorized)return access.response;
 if(!access.organizationId)return NextResponse.json({error:'Organización no disponible'},{status:403});
 const folderId=request.nextUrl.searchParams.get('carpeta_id')||'';
 const slot=Number(request.nextUrl.searchParams.get('slot_index'));
 if(!/^[0-9a-f-]{36}$/i.test(folderId)||!Number.isInteger(slot)||slot<1)return NextResponse.json({error:'Documento inválido'},{status:400});
 const db=getSupabaseServerClient();
 const {data:folder,error:folderError}=await db.from('carpetas_arranque').select('empresa_rut').eq('id',folderId).maybeSingle();
 if(folderError||!folder?.empresa_rut)return NextResponse.json({error:'Carpeta no disponible'},{status:404});
 const {data:companies,error:eeccError}=await db.from('eecc').select('rut').eq('organization_id',access.organizationId).eq('is_active',true).limit(250);
 if(eeccError)return NextResponse.json({error:'No se pudo verificar acceso'},{status:503});
 if(!(companies||[]).some(c=>rut(c.rut)&&rut(c.rut)===rut(folder.empresa_rut)))return NextResponse.json({error:'Fuera de organización'},{status:403});
 const {data, error}=await db.from('legal_ai_document_reviews')
  .select('id,file_name,file_sha256,model,analysis,suggestion,suggestion_status,created_at,created_by')
  .eq('organization_id',access.organizationId).eq('carpeta_id',folderId).eq('slot_index',slot)
  .order('created_at',{ascending:false}).limit(20);
 if(error)return NextResponse.json({error:'Historial no disponible'},{status:503});
 return NextResponse.json({history:data||[]});
}

export async function PATCH(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.LEGAL_EECC,true);
 if(!access.authorized)return access.response;
 if(!access.organizationId)return NextResponse.json({error:'Organización no disponible'},{status:403});
 const body=await request.json().catch(()=>null);
 const id=typeof body?.id==='string'?body.id:'';
 const status=body?.status;
 const suggestion=typeof body?.suggestion==='string'?body.suggestion.trim():'';
 if(!/^[0-9a-f-]{36}$/i.test(id)||!['accepted','dismissed'].includes(status)||suggestion.length>3000||(status==='accepted'&&!suggestion))
  return NextResponse.json({error:'Decisión u observación inválida'},{status:400});
 const db=getSupabaseServerClient();
 const {data:record,error:lookupError}=await db.from('legal_ai_document_reviews')
  .select('id,carpeta_id,slot_index,file_path,suggestion_status')
  .eq('id',id).eq('organization_id',access.organizationId).maybeSingle();
 if(lookupError||!record)return NextResponse.json({error:'Análisis no encontrado'},{status:404});
 if(record.suggestion_status!=='proposed')return NextResponse.json({error:'La propuesta ya fue resuelta'},{status:409});
 const {data:folder,error:folderError}=await db.from('carpetas_arranque').select('empresa_rut').eq('id',record.carpeta_id).maybeSingle();
 if(folderError||!folder?.empresa_rut)return NextResponse.json({error:'Carpeta no disponible'},{status:404});
 const {data:companies,error:companyError}=await db.from('eecc').select('rut').eq('organization_id',access.organizationId).eq('is_active',true).limit(250);
 if(companyError)return NextResponse.json({error:'No se pudo verificar organización'},{status:503});
 if(!(companies||[]).some(c=>rut(c.rut)&&rut(c.rut)===rut(folder.empresa_rut)))
  return NextResponse.json({error:'Fuera de organización'},{status:403});
 const {data:doc,error:documentError}=await db.from('carpeta_documentos').select('file_path')
  .eq('carpeta_id',record.carpeta_id).eq('slot_index',record.slot_index).maybeSingle();
 if(documentError||!doc||doc.file_path!==record.file_path)
  return NextResponse.json({error:'El documento cambió. Vuelve a analizar la versión actual'},{status:409});
 const {data, error}=await db.from('legal_ai_document_reviews').update({
   suggestion_status:status,suggestion:status==='accepted'?suggestion:null,
   reviewed_by:access.user.id,reviewed_at:new Date().toISOString()
  }).eq('id',id).eq('organization_id',access.organizationId).eq('suggestion_status','proposed')
  .select('id,suggestion_status,suggestion,reviewed_at').maybeSingle();
 if(error)return NextResponse.json({error:'No se pudo guardar la decisión'},{status:503});
 if(!data)return NextResponse.json({error:'La propuesta ya fue resuelta'},{status:409});
 return NextResponse.json({review:data,document_approval_changed:false});
}
