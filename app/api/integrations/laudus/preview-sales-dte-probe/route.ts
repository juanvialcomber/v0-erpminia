export const dynamic = 'force-dynamic';

import { NextResponse } from 'next/server';
import { listLaudus } from '@/lib/integrations/laudus/client';

function rowsFrom(payload: unknown) {
  if (Array.isArray(payload)) return payload;
  if (!payload || typeof payload !== 'object') return [];
  const record=payload as Record<string,unknown>;
  for(const key of ['data','items','results','rows']) if(Array.isArray(record[key])) return record[key] as unknown[];
  return [];
}

async function probe(path:string, fields:string[]) {
  try {
    const payload=await listLaudus(path,{options:{offset:0,limit:1},fields});
    const rows=rowsFrom(payload);
    const row=rows[0] && typeof rows[0]==='object' ? rows[0] as Record<string,unknown> : null;
    return {ok:true,path,rows:rows.length,fields:row?Object.keys(row):[]};
  } catch(error) {
    return {ok:false,path,error:error instanceof Error?error.message:'unknown'};
  }
}

export async function GET() {
  const allowed=process.env.VERCEL_ENV==='preview' &&
    process.env.VERCEL_GIT_COMMIT_REF==='probe/laudus-sales-dte-contract-20261103';
  if(!allowed) return NextResponse.json({error:'Not found'},{status:404});

  const invoices=await probe('/sales/invoices/list',[
    'invoiceId','docNumber','issuedDate','documentStatus','customer.customerId',
    'customer.name','customer.VATId','totals.total'
  ]);
  const waybills=await probe('/sales/waybills/list',[
    'waybillId','docNumber','issuedDate','documentStatus','customer.customerId',
    'customer.name','customer.VATId','totals.total'
  ]);

  return NextResponse.json({persisted:false,invoices,waybills});
}
