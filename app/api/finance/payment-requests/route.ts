export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

async function financeWrite(request: NextRequest) {
  const access=await requireModuleAccess(request,MODULE_KEYS.FIN_FINANZAS,true);
  if(!access.authorized)return {ok:false as const,response:access.response};
  const context=await getOrganizationContext(request);
  if(!context.ok)return {ok:false as const,response:context.response};
  return {ok:true as const,context,access};
}

export async function GET(request: NextRequest){
  const auth=await financeWrite(request);
  if(!auth.ok)return auth.response;

  const {data:requests,error}=await auth.context.supabase
    .from('finance_payment_requests')
    .select('id,payable_id,amount,currency,requested_payment_date,status,required_signatures,request_note,created_by,created_at,updated_at,executed_at,bank_reference,evidence_url,evidence_document_id')
    .eq('organization_id',auth.context.organizationId)
    .order('created_at',{ascending:false})
    .limit(200);

  if(error)return NextResponse.json({error:'No se pudieron cargar solicitudes de pago'},{status:503});

  const ids=(requests||[]).map((row)=>row.id);
  const payableIds=[...new Set((requests||[]).map((row)=>row.payable_id).filter(Boolean))];
  const [{data:signatures,error:signatureError},{data:payables,error:payableError}]=await Promise.all([
    ids.length?auth.context.supabase
      .from('finance_payment_request_signatures')
      .select('id,request_id,signer_id,decision,note,signed_at')
      .eq('organization_id',auth.context.organizationId)
      .in('request_id',ids)
      .limit(1000):Promise.resolve({data:[],error:null}),
    payableIds.length?auth.context.supabase
      .from('procurement_accounts_payable_v1')
      .select('id,invoice_number,supplier_name,currency,approved_amount,due_date,status,paid_amount,outstanding_amount')
      .eq('organization_id',auth.context.organizationId)
      .in('id',payableIds)
      .limit(500):Promise.resolve({data:[],error:null}),
  ]);
  if(signatureError)return NextResponse.json({error:'No se pudieron cargar firmas'},{status:503});
  if(payableError)return NextResponse.json({error:'No se pudieron resolver cuentas por pagar'},{status:503});

  const signatureByRequest=new Map<string,typeof signatures>();
  for(const signature of signatures||[]){
    const list=signatureByRequest.get(signature.request_id)||[];
    list.push(signature);
    signatureByRequest.set(signature.request_id,list);
  }
  const payableById=new Map((payables||[]).map((row)=>[row.id,row]));

  return NextResponse.json({
    data:(requests||[]).map((row)=>{
      const requestSignatures=signatureByRequest.get(row.id)||[];
      return {
        ...row,
        payable:payableById.get(row.payable_id)||null,
        signatures:requestSignatures,
        approved_signatures:requestSignatures.filter((item)=>item.decision==='approved').length,
        rejected_signatures:requestSignatures.filter((item)=>item.decision==='rejected').length,
        can_current_user_sign:row.created_by!==auth.context.userId && !requestSignatures.some((item)=>item.signer_id===auth.context.userId) && row.status==='pending_signatures',
      };
    }),
    policy:{
      separation:'El creador de una solicitud no puede firmarla. Cada usuario firma una sola vez.',
      execution:'Aprobar firmas no ejecuta la transferencia. La ejecución financiera permanece separada.',
    },
  });
}

export async function POST(request: NextRequest){
  const auth=await financeWrite(request);
  if(!auth.ok)return auth.response;

  const body=await request.json().catch(()=>({}));
  const requestId=String(body.requestId||'').trim();
  const decision=String(body.decision||'').trim();
  const note=body.note?String(body.note).trim().slice(0,1000):null;

  if(!requestId)return NextResponse.json({error:'Solicitud requerida'},{status:400});
  if(!['approved','rejected'].includes(decision))return NextResponse.json({error:'Decisión inválida'},{status:400});
  if(decision==='rejected'&&!note)return NextResponse.json({error:'El rechazo requiere una observación'},{status:400});

  const {data:paymentRequest,error:requestError}=await auth.context.supabase
    .from('finance_payment_requests')
    .select('id,payable_id,status,required_signatures,created_by')
    .eq('organization_id',auth.context.organizationId)
    .eq('id',requestId)
    .maybeSingle();

  if(requestError)return NextResponse.json({error:'No se pudo verificar la solicitud'},{status:503});
  if(!paymentRequest)return NextResponse.json({error:'Solicitud no encontrada en la organización'},{status:404});
  if(paymentRequest.status!=='pending_signatures')return NextResponse.json({error:'La solicitud ya no está pendiente de firmas'},{status:409});
  if(paymentRequest.created_by===auth.context.userId)return NextResponse.json({error:'El creador de la solicitud no puede firmarla'},{status:409});

  const {data:existing,error:existingError}=await auth.context.supabase
    .from('finance_payment_request_signatures')
    .select('id')
    .eq('organization_id',auth.context.organizationId)
    .eq('request_id',requestId)
    .eq('signer_id',auth.context.userId)
    .maybeSingle();

  if(existingError)return NextResponse.json({error:'No se pudo verificar la firma existente'},{status:503});
  if(existing)return NextResponse.json({error:'Ya registraste una decisión para esta solicitud'},{status:409});

  const {error:signatureInsertError}=await auth.context.supabase
    .from('finance_payment_request_signatures')
    .insert({
      organization_id:auth.context.organizationId,
      request_id:requestId,
      signer_id:auth.context.userId,
      decision,
      note,
    });

  if(signatureInsertError){
    console.error('[finance/payment-requests:sign]',signatureInsertError);
    return NextResponse.json({error:'No se pudo registrar la decisión'},{status:503});
  }

  if(decision==='rejected'){
    const {error:updateError}=await auth.context.supabase
      .from('finance_payment_requests')
      .update({status:'rejected',updated_at:new Date().toISOString()})
      .eq('organization_id',auth.context.organizationId)
      .eq('id',requestId)
      .eq('status','pending_signatures');
    if(updateError)return NextResponse.json({error:'La firma quedó registrada, pero no se pudo cerrar la solicitud rechazada'},{status:503});
    const { error:auditError }=await auth.context.supabase.from('audit_log').insert({
      organization_id:auth.context.organizationId,
      user_id:auth.context.userId,
      action:'finance.payment_request.signed',
      resource_type:'finance_payment_request',
      resource_id:requestId,
      resource_identifier:requestId,
      new_values:{decision:'rejected',status:'rejected',note},
      status:'completed',
    });
    if(auditError)console.error('[finance/payment-requests:audit]',auditError);
    return NextResponse.json({status:'rejected',execution:false});
  }

  const {count,error:countError}=await auth.context.supabase
    .from('finance_payment_request_signatures')
    .select('id',{count:'exact',head:true})
    .eq('organization_id',auth.context.organizationId)
    .eq('request_id',requestId)
    .eq('decision','approved');

  if(countError)return NextResponse.json({error:'La firma quedó registrada, pero no se pudo contar aprobaciones'},{status:503});
  const approvedCount=count||0;
  let status='pending_signatures';
  if(approvedCount>=Number(paymentRequest.required_signatures||2)){
    const {error:updateError}=await auth.context.supabase
      .from('finance_payment_requests')
      .update({status:'approved',updated_at:new Date().toISOString()})
      .eq('organization_id',auth.context.organizationId)
      .eq('id',requestId)
      .eq('status','pending_signatures');
    if(updateError)return NextResponse.json({error:'Las firmas están completas, pero no se pudo actualizar la solicitud'},{status:503});
    status='approved';
  }

  const { error:auditError }=await auth.context.supabase.from('audit_log').insert({
    organization_id:auth.context.organizationId,
    user_id:auth.context.userId,
    action:'finance.payment_request.signed',
    resource_type:'finance_payment_request',
    resource_id:requestId,
    resource_identifier:requestId,
    new_values:{decision:'approved',approved_signatures:approvedCount,required_signatures:paymentRequest.required_signatures,status},
    status:'completed',
  });
  if(auditError)console.error('[finance/payment-requests:audit]',auditError);

  return NextResponse.json({
    status,
    approved_signatures:approvedCount,
    required_signatures:paymentRequest.required_signatures,
    execution:false,
    authority:'Firmas registradas. MOTIL no ejecutó ningún pago.',
  });
}
