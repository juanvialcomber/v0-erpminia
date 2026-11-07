import {NextRequest,NextResponse} from 'next/server';
import {requireModuleAccess,MODULE_KEYS} from '@/lib/api/module-access';
import {getSupabaseServerClient} from '@/lib/supabase-server';
export const dynamic='force-dynamic';
const normalizedRut=(v:string|null)=>String(v||'').replace(/[^0-9kK]/g,'').toUpperCase();
const currentPeriod=()=>{
 const parts=new Intl.DateTimeFormat('en-CA',{timeZone:'America/Santiago',year:'numeric',month:'2-digit'}).formatToParts(new Date());
 const year=parts.find(p=>p.type==='year')?.value;
 const month=parts.find(p=>p.type==='month')?.value;
 return `${year}-${month}-01`;
};
export async function GET(request:NextRequest){
 const access=await requireModuleAccess(request,MODULE_KEYS.LEGAL_EECC);
 if(!access.authorized)return access.response;
 if(!access.organizationId)return NextResponse.json({error:'Organización no disponible'},{status:403});
 const db=getSupabaseServerClient();
 const period=currentPeriod();
 const {data:companies,error:companyError}=await db.from('eecc').select('id,name,rut').eq('organization_id',access.organizationId).eq('is_active',true).order('name').limit(250);
 if(companyError)return NextResponse.json({error:'No se pudo consultar empresas contratistas'},{status:503});
 const companyRuts=new Set((companies||[]).map(c=>normalizedRut(c.rut)).filter(Boolean));
 const {data:folders,error:folderError}=await db.from('carpetas_arranque').select('id,empresa_rut,status,compliance_period').eq('compliance_period',period).order('created_at',{ascending:false}).limit(500);
 if(folderError)return NextResponse.json({error:'No se pudo consultar carpetas del período'},{status:503});
 const relevant=(folders||[]).filter(f=>companyRuts.has(normalizedRut(f.empresa_rut)));
 const byRut=new Map(relevant.map(f=>[normalizedRut(f.empresa_rut),f]));
 const entries=(companies||[]).map(c=>{
   const folder=byRut.get(normalizedRut(c.rut));
   return {id:c.id,name:c.name,has_folder:Boolean(folder),folder_status:folder?.status||null};
 });
 return NextResponse.json({
  period,
  summary:{
   registered:entries.length,
   with_folder:entries.filter(e=>e.has_folder).length,
   without_folder:entries.filter(e=>!e.has_folder).length,
   in_review:entries.filter(e=>e.folder_status==='en_revision_l1'||e.folder_status==='en_revision_l2').length,
   approved:entries.filter(e=>e.folder_status==='aprobado').length,
  },
  without_folder:entries.filter(e=>!e.has_folder).slice(0,20),
 });
}
