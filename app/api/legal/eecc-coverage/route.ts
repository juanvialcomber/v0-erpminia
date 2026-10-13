import {NextRequest,NextResponse} from 'next/server';
import {requireModuleAccess,MODULE_KEYS} from '@/lib/api/module-access';
import {getSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
const normalizedRut=(v:string|null)=>String(v||'').replace(/[^0-9kK]/g,'').toUpperCase();
export async function GET(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.LEGAL_EECC);
 if(!access.authorized)return access.response;
 if(!access.organizationId)return NextResponse.json({error:'Organización no disponible'},{status:403});
 const db=getSupabaseServerClient();
 const {data:companies,error:companyError}=await db.from('eecc').select('id,name,rut').eq('organization_id',access.organizationId).eq('is_active',true).order('name').limit(250);
 if(companyError)return NextResponse.json({error:'No se pudo consultar empresas contratistas'},{status:503});
 const {data:folders,error:folderError}=await db.from('carpetas_arranque').select('id,empresa_rut').order('created_at',{ascending:false}).limit(500);
 if(folderError)return NextResponse.json({error:'No se pudo consultar carpetas'},{status:503});
 const folderRuts=new Set((folders||[]).map(f=>normalizedRut(f.empresa_rut)).filter(Boolean));
 const entries=(companies||[]).map(c=>({id:c.id,name:c.name,has_folder:folderRuts.has(normalizedRut(c.rut))}));
 return NextResponse.json({summary:{registered:entries.length,with_folder:entries.filter(e=>e.has_folder).length,without_folder:entries.filter(e=>!e.has_folder).length},without_folder:entries.filter(e=>!e.has_folder).slice(0,20)});
}
