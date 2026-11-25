export const dynamic = 'force-dynamic';
import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request:NextRequest){
  const access=await requireModuleAccess(request,MODULE_KEYS.FIN_FINANZAS);
  if(!access.authorized)return access.response;
  const context=await getOrganizationContext(request);
  if(!context.ok)return context.response;
  const headers={'Cache-Control':'private, no-store'};
  const org=context.organizationId;
  const db=context.supabase;
  const page=Number(request.nextUrl.searchParams.get('page')??'1');
  if(!Number.isSafeInteger(page)||page<1||page>10000)return NextResponse.json({error:'Página inválida'},{status:400,headers});
  try{
    const {data:orders,count,error}=await db.from('procurement_operational_orders')
      .select('id,order_number,status,currency,total_amount,issued_at,cost_center_id',{count:'exact'})
      .eq('organization_id',org).not('order_number','ilike','UAT-%')
      .order('issued_at',{ascending:false}).order('id').range((page-1)*20,page*20-1);
    if(error||!orders||count===null)throw new Error('orders');
    const ids=orders.map(o=>o.id);
    if(!ids.length)return NextResponse.json({rows:[],total:count,page},{headers});
    const [receipts,invoices,matching]=await Promise.all([
      db.from('procurement_operational_receipts').select('id,order_id,receipt_number,received_at').eq('organization_id',org).in('order_id',ids).limit(1001),
      db.from('procurement_supplier_invoices').select('id,order_id,invoice_number,invoice_date,currency,total_amount,status').eq('organization_id',org).in('order_id',ids).not('invoice_number','ilike','UAT-%').limit(1001),
      db.from('procurement_three_way_match_summary_v1').select('invoice_id,order_id,match_status,line_count,matched_line_count,pending_receipt_line_count,exception_line_count').eq('organization_id',org).in('order_id',ids).limit(1001),
    ]);
    if([receipts,invoices,matching].some(x=>x.error||!x.data||x.data.length>=1000))throw new Error('incomplete evidence');
    const invoiceRows=invoices.data??[];
    const invoiceIds=invoiceRows.map(i=>i.id);
    const payableResult=invoiceIds.length?await db.from('procurement_accounts_payable_v1').select('id,invoice_id,currency,approved_amount,paid_amount,outstanding_amount,status').eq('organization_id',org).in('invoice_id',invoiceIds).limit(1001):{data:[],error:null};
    if(payableResult.error||!payableResult.data||payableResult.data.length>=1000)throw new Error('payables');
    const payables=payableResult.data;
    const payableIds=payables.map(p=>p.id);
    const payments=payableIds.length?await db.from('procurement_supplier_payments').select('id,payable_id,amount,currency,payment_date,reconciled_at').eq('organization_id',org).in('payable_id',payableIds).limit(1001):{data:[],error:null};
    if(payments.error||!payments.data||payments.data.length>=1000)throw new Error('payments');
    const rows=orders.map(order=>({...order,receipts:(receipts.data??[]).filter(r=>r.order_id===order.id),invoices:invoiceRows.filter(i=>i.order_id===order.id).map(invoice=>({...invoice,matching:(matching.data??[]).filter(m=>m.invoice_id===invoice.id&&m.order_id===order.id),payables:payables.filter(p=>p.invoice_id===invoice.id).map(p=>({...p,payments:(payments.data??[]).filter(x=>x.payable_id===p.id)}))}))}));
    return NextResponse.json({rows,total:count,page},{headers});
  }catch{
    return NextResponse.json({error:'No se pudo verificar la cadena completa de documentos.'},{status:503,headers});
  }
}
