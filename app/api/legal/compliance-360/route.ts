export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';
import { SERNAGEOMIN_OBLIGATIONS } from '@/lib/intelligence/sernageomin-obligations';
import { loadRegulatoryIntelligenceContext } from '@/lib/intelligence/regulatory-intelligence-context';

async function access(request:NextRequest){
 const context=await getOrganizationContext(request);
 if(!context.ok)return {ok:false as const,response:context.response};
 const level=await getModuleAccessLevel(context.userId,context.role,MODULE_KEYS.LEGAL_MODULO);
 if(level!=='ED'&&level!=='LEC')return {ok:false as const,response:NextResponse.json({error:'Acceso denegado'},{status:403})};
 return {ok:true as const,context,level};
}
export async function GET(request:NextRequest){
 const a=await access(request);if(!a.ok)return a.response;
 const {data,error}=await a.context.supabase.from('legal_cases').select('id,title,status,evidence_status,operational_owner,legal_owner,due_at,action_required,metadata,updated_at').eq('organization_id',a.context.organizationId).eq('source_type','sernageomin_obligation').limit(500);
 if(error)return NextResponse.json({error:error.message},{status:500});
 if(new URL(request.url).searchParams.get('export')==='1'){
   const registry=(data||[]).map(row=>({
     obligationId:row.metadata?.obligationId||null,
     caseId:row.id,
     title:row.title,
     legalBasis:SERNAGEOMIN_OBLIGATIONS.find(o=>o.id===row.metadata?.obligationId)?.legalBasis||[],
     applicability:row.metadata?.applicability||'undetermined',
     reviewStatus:row.status,
     evidenceStatus:row.evidence_status,
     responsibleArea:row.operational_owner,
     dueDate:row.due_at,
     nextAction:row.action_required,
     decisionHistory:row.metadata?.history||[],
     evidenceReferences:(row.metadata?.history||[]).filter((event:{evidenceRef?:string})=>Boolean(event.evidenceRef)).map((event:{evidenceRef:string})=>event.evidenceRef),
   }));
   const exportData={source:'MOTIL · Legal Compliance 360',authority:'SERNAGEOMIN',generatedAt:new Date().toISOString(),scope:'Expedientes de obligaciones revisadas por Legal',complianceVerdictCalculated:false,notice:'Expediente de trabajo; no es certificado de cumplimiento ni reemplaza documentación oficial.',records:registry};
   const filename='MOTIL_SERNAGEOMIN_Expedientes_'+new Date().toISOString().slice(0,10)+'.json';
   return new NextResponse(JSON.stringify(exportData,null,2),{headers:{'Content-Type':'application/json; charset=utf-8','Content-Disposition':'attachment; filename="'+filename+'"','Cache-Control':'private, no-store'}});
 }
 return NextResponse.json({items:data||[],canWrite:a.level==='ED'});
}
export async function POST(request:NextRequest){
 const a=await access(request);if(!a.ok)return a.response;
 if(a.level!=='ED')return NextResponse.json({error:'Solo Legal con permiso de edición puede decidir'},{status:403});
 const body=await request.json().catch(()=>null);
 const obligation=SERNAGEOMIN_OBLIGATIONS.find(o=>o.id===body?.obligationId);
 if(!obligation)return NextResponse.json({error:'Obligación no reconocida'},{status:400});
 const action=body?.action;
 if(!['applicability','request_evidence','approve_evidence','return_evidence'].includes(action))return NextResponse.json({error:'Acción inválida'},{status:400});
 const note=String(body?.note||'').trim().slice(0,1500);
 if(!note)return NextResponse.json({error:'Fundamento u observación obligatoria'},{status:400});
 const evidenceRef=String(body?.evidenceRef||'').trim().slice(0,300);
 if(action==='approve_evidence'&&!evidenceRef)return NextResponse.json({error:'Para aprobar se requiere una referencia verificable a evidencia canónica'},{status:400});
 if(action==='approve_evidence'){
   const regulatory=await loadRegulatoryIntelligenceContext(a.context,100);
   if(!regulatory.available||!regulatory.canonicalEvidence?.items.some(item=>item.canonicalRef===evidenceRef))return NextResponse.json({error:'La evidencia no existe en las fuentes canónicas disponibles; actualiza y elige una referencia real'},{status:409});
 }
 const due=body?.dueDate;
 if(due && !/^\d{4}-\d{2}-\d{2}$/.test(due))return NextResponse.json({error:'Fecha inválida'},{status:400});
 if(action==='applicability'&&!['applicable','not_applicable','undetermined'].includes(body?.decision))return NextResponse.json({error:'Decisión inválida'},{status:400});
 const {data:existing,error:lookupError}=await a.context.supabase.from('legal_cases').select('id,metadata,status,evidence_status,operational_owner,due_at').eq('organization_id',a.context.organizationId).eq('source_type','sernageomin_obligation').contains('metadata',{obligationId:obligation.id}).limit(1).maybeSingle();
 if(lookupError)return NextResponse.json({error:lookupError.message},{status:500});
 const oldMeta=(existing?.metadata&&typeof existing.metadata==='object'&&!Array.isArray(existing.metadata))?existing.metadata as Record<string,unknown>:{};
 if(action==='approve_evidence'&&oldMeta.applicability!=='applicable')return NextResponse.json({error:'Antes de validar evidencia, Legal debe confirmar que la obligación aplica a esta faena'},{status:409});
 const history=Array.isArray(oldMeta.history)?oldMeta.history:[];
 const at=new Date().toISOString();
 const metadata={...oldMeta,obligationId:obligation.id,applicability:action==='applicability'?body.decision:(oldMeta.applicability||'undetermined'),history:[...history,{action,decision:action==='applicability'?body.decision:null,note,evidenceRef:evidenceRef||null,at,actorId:a.context.userId}]};
 const payload={organization_id:a.context.organizationId,source_type:'sernageomin_obligation',source_module:'legal_modulo',title:obligation.title,reason:obligation.legalBasis.join(' · '),priority:obligation.priority,legal_owner:'Legal',operational_owner:String(body?.owner||existing?.operational_owner||obligation.businessOwner).slice(0,150),due_at:due||existing?.due_at||null,action_required:note,evidence_status:action==='approve_evidence'?'complete':action==='return_evidence'?'partial':(existing?.evidence_status||'pending'),status:action==='request_evidence'?'waiting_area':action==='return_evidence'?'action_required':'in_review',metadata,updated_at:at};
 const result=existing
  ? await a.context.supabase.from('legal_cases').update(payload).eq('id',existing.id).eq('organization_id',a.context.organizationId).select('id').single()
  : await a.context.supabase.from('legal_cases').insert(payload).select('id').single();
 if(result.error)return NextResponse.json({error:result.error.message},{status:500});
 return NextResponse.json({id:result.data?.id,status:payload.status});
}
