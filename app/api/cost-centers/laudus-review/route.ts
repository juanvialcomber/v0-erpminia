export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const DECISIONS=new Set(['approve_proposal','reject_proposal','defer']);

export async function GET(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.CORE_CENTROS_COSTOS);
  if(!access.authorized) return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok) return context.response;

  const {data,error}=await context.supabase.rpc('motil_laudus_cost_center_review_queue',{
    p_organization_id:context.organizationId,
    p_limit:100,
  });
  if(error){
    console.error('[cost-centers/laudus-review/get]',error.message);
    return NextResponse.json({error:'No se pudo cargar la revisión Laudus.'},{status:500});
  }
  return NextResponse.json(data||{summary:{},queue:[],canonical_mutated:false,laudus_mutated:false});
}

export async function POST(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.CORE_CENTROS_COSTOS,true);
  if(!access.authorized) return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok) return context.response;

  const body=await request.json().catch(()=>({}));
  const laudusExternalId=String(body?.laudusExternalId||'').trim();
  const decision=String(body?.decision||'');
  const rationale=String(body?.rationale||'').trim().slice(0,1000);
  if(!laudusExternalId||!DECISIONS.has(decision)){
    return NextResponse.json({error:'Decisión o centro Laudus inválido.'},{status:400});
  }

  const {data:queue,error:queueError}=await context.supabase.rpc('motil_laudus_cost_center_review_queue',{
    p_organization_id:context.organizationId,
    p_limit:100,
  });
  if(queueError) return NextResponse.json({error:'No se pudo verificar la propuesta.'},{status:500});
  const proposal=Array.isArray(queue?.queue)
    ? queue.queue.find((row:any)=>String(row.laudus_external_id)===laudusExternalId)
    : null;
  if(!proposal) return NextResponse.json({error:'La propuesta ya no está disponible.'},{status:409});

  const snapshot={
    operational_code:proposal.operational_code,
    laudus_name:proposal.laudus_name,
    laudus_full_path:proposal.laudus_full_path,
    canonical_parent_id:proposal.canonical_parent_id,
    canonical_parent_code:proposal.canonical_parent_code,
    canonical_parent_name:proposal.canonical_parent_name,
    suggested_center_type:proposal.suggested_center_type,
    asset_id:proposal.asset_id,
    asset_code:proposal.asset_code,
    asset_name:proposal.asset_name,
    license_plate:proposal.license_plate,
    evidence_level:proposal.evidence_level,
  };

  const {error}=await context.supabase.from('laudus_cost_center_review_decisions').upsert({
    organization_id:context.organizationId,
    laudus_external_id:laudusExternalId,
    operational_code:proposal.operational_code,
    decision,
    rationale:rationale||null,
    reviewer_user_id:access.user.id,
    decided_at:new Date().toISOString(),
    proposal_snapshot:snapshot,
  },{onConflict:'organization_id,laudus_external_id'});

  if(error){
    console.error('[cost-centers/laudus-review/post]',error.message);
    return NextResponse.json({error:'No se pudo guardar la decisión.'},{status:500});
  }

  return NextResponse.json({
    ok:true,
    decision,
    canonicalMutated:false,
    laudusMutated:false,
    nextStep:'La aprobación registra intención; el alta canónica sigue separada.',
  });
}
