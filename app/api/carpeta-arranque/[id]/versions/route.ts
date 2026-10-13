import {NextRequest,NextResponse} from 'next/server';
import {requireModuleAccess,MODULE_KEYS} from '@/lib/api/module-access';
import {getSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest,{params}:{params:Promise<{id:string}>}){
 const access=await requireModuleAccess(request,MODULE_KEYS.LEGAL_EECC);
 if(!access.authorized)return access.response;
 const {id}=await params;
 const db=getSupabaseServerClient();
 const {data:folder,error:folderError}=await db.from('carpetas_arranque').select('id').eq('id',id).maybeSingle();
 if(folderError||!folder)return NextResponse.json({error:'Carpeta no encontrada'},{status:404});
 const {data,error}=await db.from('carpeta_documento_versiones')
 .select('id,documento_id,slot_index,file_name,uploaded_at,archived_at,l1_status,l1_observaciones,l1_reviewed_by,l1_reviewed_at,l2_status,l2_observaciones,l2_reviewed_by,l2_reviewed_at')
 .eq('carpeta_id',id).order('archived_at',{ascending:false}).limit(100);
 if(error)return NextResponse.json({error:'Historial documental no disponible'},{status:503});
 return NextResponse.json({versions:data});
}
