
export const dynamic='force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { reconcilePlantShiftEvidence } from '@/lib/production/plant-shift-evidence.mjs';

export async function GET(request:NextRequest) {
  const access=await requireModuleAccess(request,MODULE_KEYS.PROD_OPERACIONES);
  if(!access.authorized)return access.response;
  const ctx=await getOrganizationContext(request);
  if(!ctx.ok)return ctx.response;
  const cutoff='2026-08-19';
  const [source,canonical,latest]=await Promise.all([
    ctx.supabase.from('motil_whatsapp_laboratory_received_v1')
      .select('message_id,attachment_id,table_index,row_index,resolved_sample_date,date_resolution,source_cells,approved_for_canonical_import,whatsapp_sent_date_cl',{count:'exact'})
      .eq('organization_id',ctx.organizationId).eq('source_family','planta_turno')
      .gte('whatsapp_sent_date_cl',cutoff).order('whatsapp_sent_date_cl',{ascending:false}).limit(250),
    ctx.supabase.from('production_plant_shifts')
      .select('operation_date,shift_code',{count:'exact'})
      .eq('organization_id',ctx.organizationId).gte('operation_date',cutoff).limit(500),
    ctx.supabase.from('production_plant_shifts').select('operation_date')
      .eq('organization_id',ctx.organizationId).order('operation_date',{ascending:false}).limit(1).maybeSingle(),
  ]);
  const fail=source.error||canonical.error||latest.error;
  if(fail)return NextResponse.json({error:fail.message},{status:503,headers:{'Cache-Control':'private, no-store'}});
  if((source.count??0)>250||(canonical.count??0)>500)
    return NextResponse.json({error:'Cobertura mayor al lote de conciliación: se requiere paginar antes de emitir cifras.'},{status:503});
  const sourceRows=source.data||[];
  const ids=[...new Set(sourceRows.map(row=>row.attachment_id).filter(Boolean))] as string[];
  const hashes=new Map<string,string|null>();
  for(let i=0;i<ids.length;i+=50){
    const response=await ctx.supabase.from('motil_whatsapp_attachments').select('id,sha256')
      .eq('organization_id',ctx.organizationId).in('id',ids.slice(i,i+50));
    if(response.error)return NextResponse.json({error:response.error.message},{status:503});
    for(const row of response.data||[])hashes.set(row.id,row.sha256||null);
  }
  if(hashes.size!==ids.length)return NextResponse.json({error:'Algunas evidencias no tienen vínculo con su adjunto original.'},{status:503});
  const reconciled=reconcilePlantShiftEvidence(sourceRows.map(row=>({
    ...row,sha256:hashes.get(row.attachment_id)||null,
  })),canonical.data||[]);
  return NextResponse.json({...reconciled,canonicalThrough:latest.data?.operation_date||null,
    note:'Solo evidencia: no sumar al balance, ni considerar las toneladas secas (TMS) como húmedas, ni promover sin validación humana.',
  },{headers:{'Cache-Control':'private, no-store'}});
}
