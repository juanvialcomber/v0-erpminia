export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

const ACTIVE_REQUEST_STATUSES = ['pending_signatures','approved'];

async function authorizeLegalWrite(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return { ok:false as const, response:context.response };
  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED') {
    return { ok:false as const, response:NextResponse.json({error:'Se requiere permiso de edición Legal'},{status:403}) };
  }
  return { ok:true as const, context };
}

export async function GET(request: NextRequest) {
  const auth = await authorizeLegalWrite(request);
  if (!auth.ok) return auth.response;

  const { data, error } = await auth.context.supabase
    .from('finance_payment_requests')
    .select('id,payable_id,amount,currency,requested_payment_date,status,required_signatures,request_note,created_by,created_at,updated_at,executed_at,bank_reference,evidence_url,evidence_document_id')
    .eq('organization_id', auth.context.organizationId)
    .order('created_at',{ascending:false})
    .limit(200);

  if (error) return NextResponse.json({error:'No se pudieron cargar solicitudes de pago'},{status:503});

  const requestIds=(data||[]).map((row)=>row.id);
  const { data: signatures, error: signatureError } = requestIds.length
    ? await auth.context.supabase
        .from('finance_payment_request_signatures')
        .select('request_id,signer_id,decision,note,signed_at')
        .eq('organization_id',auth.context.organizationId)
        .in('request_id',requestIds)
        .limit(1000)
    : {data:[],error:null};

  if (signatureError) return NextResponse.json({error:'No se pudieron cargar firmas de solicitudes de pago'},{status:503});

  const signaturesByRequest=new Map<string,typeof signatures>();
  for(const signature of signatures||[]){
    const list=signaturesByRequest.get(signature.request_id)||[];
    list.push(signature);
    signaturesByRequest.set(signature.request_id,list);
  }

  return NextResponse.json({
    data:(data||[]).map((row)=>({
      ...row,
      signatures:signaturesByRequest.get(row.id)||[],
      signatures_done:(signaturesByRequest.get(row.id)||[]).filter((item)=>item.decision==='approved').length,
    })),
    policy:{
      authority:'Legal puede preparar una solicitud. Las firmas y la ejecución permanecen fuera de este endpoint.',
    },
  });
}

export async function POST(request: NextRequest) {
  const auth = await authorizeLegalWrite(request);
  if (!auth.ok) return auth.response;

  const body=await request.json().catch(()=>({}));
  const payableId=String(body.payableId||'').trim();
  const requestedPaymentDate=body.requestedPaymentDate ? String(body.requestedPaymentDate) : null;
  const requestNote=body.requestNote ? String(body.requestNote).trim().slice(0,1000) : null;

  if(!payableId) return NextResponse.json({error:'Cuenta por pagar requerida'},{status:400});

  const { data: payable, error: payableError } = await auth.context.supabase
    .from('procurement_accounts_payable_v1')
    .select('id,invoice_number,supplier_name,currency,approved_amount,due_date,status,paid_amount,outstanding_amount')
    .eq('organization_id',auth.context.organizationId)
    .eq('id',payableId)
    .maybeSingle();

  if(payableError) return NextResponse.json({error:'No se pudo verificar la cuenta por pagar'},{status:503});
  if(!payable) return NextResponse.json({error:'Cuenta por pagar no encontrada en la organización'},{status:404});

  const outstanding=Number(payable.outstanding_amount||0);
  const payableStatus=String(payable.status||'').toLowerCase();

  if(outstanding<=0 || ['paid','reconciled','cancelled'].includes(payableStatus)){
    return NextResponse.json({error:'La cuenta por pagar no tiene saldo solicitables'},{status:409});
  }
  if(!payable.due_date){
    return NextResponse.json({error:'Defina vencimiento antes de crear una solicitud de pago'},{status:409});
  }
  if(!['open','partially_paid'].includes(payableStatus)){
    return NextResponse.json({error:'La cuenta por pagar aún no está habilitada para solicitud de pago'},{status:409});
  }

  const { data: existing, error: existingError } = await auth.context.supabase
    .from('finance_payment_requests')
    .select('id,status')
    .eq('organization_id',auth.context.organizationId)
    .eq('payable_id',payableId)
    .in('status',ACTIVE_REQUEST_STATUSES)
    .limit(1)
    .maybeSingle();

  if(existingError) return NextResponse.json({error:'No se pudo verificar solicitudes existentes'},{status:503});
  if(existing){
    return NextResponse.json({error:'Ya existe una solicitud de pago activa para esta cuenta',requestId:existing.id},{status:409});
  }

  const { data: created, error: createError } = await auth.context.supabase
    .from('finance_payment_requests')
    .insert({
      organization_id:auth.context.organizationId,
      payable_id:payableId,
      amount:outstanding,
      currency:payable.currency,
      requested_payment_date:requestedPaymentDate,
      status:'pending_signatures',
      required_signatures:2,
      request_note:requestNote,
      created_by:auth.context.userId,
    })
    .select('id,payable_id,amount,currency,requested_payment_date,status,required_signatures,created_at')
    .single();

  if(createError) {
    console.error('[legal/payment-requests:create]',createError);
    return NextResponse.json({error:'No se pudo crear la solicitud de pago'},{status:503});
  }

  return NextResponse.json({
    request:created,
    payable:{
      invoice_number:payable.invoice_number,
      supplier_name:payable.supplier_name,
      due_date:payable.due_date,
      outstanding_amount:outstanding,
    },
    authority:'Solicitud creada para firmas. MOTIL no ejecutó ningún pago.',
  },{status:201});
}
