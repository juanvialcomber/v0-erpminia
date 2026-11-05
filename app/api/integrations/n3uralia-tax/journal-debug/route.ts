import { NextResponse } from 'next/server';
import { greenApiOrigin } from '@/lib/messages/greenapi-host';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') return new NextResponse(null,{status:404});

  const instance = process.env.GREENAPI_ID_INSTANCE?.trim();
  const token = process.env.GREENAPI_API_TOKEN_INSTANCE?.trim();
  const origin = greenApiOrigin(process.env.GREENAPI_API_URL);
  const groupId = String(process.env.N3URALIA_ACCOUNTING_WHATSAPP_GROUP_ID || '').trim();

  if (!instance || !token || !groupId) {
    return NextResponse.json({ok:false,error:'not_configured'},{status:503});
  }

  const call = async (method:string) => {
    const r = await fetch(`${origin}/waInstance${instance}/${method}/${token}?minutes=30`,{
      cache:'no-store',
      signal:AbortSignal.timeout(15000),
    });
    if(!r.ok) return {status:r.status,items:[] as any[]};
    const data = await r.json();
    return {status:r.status,items:Array.isArray(data)?data:[]};
  };

  const [incoming,outgoing] = await Promise.all([
    call('lastIncomingMessages'),
    call('lastOutgoingMessages'),
  ]);

  const project = (items:any[]) => items
    .filter((x:any)=>String(x?.chatId||'')===groupId)
    .slice(-20)
    .map((x:any)=>({
      idMessage:x?.idMessage||null,
      timestamp:x?.timestamp||null,
      type:x?.type||null,
      typeMessage:x?.typeMessage||null,
      textMessage:typeof x?.textMessage==='string'?x.textMessage.slice(0,200):null,
      sendByApi:typeof x?.sendByApi==='boolean'?x.sendByApi:null,
      statusMessage:x?.statusMessage||null,
      senderName:x?.senderName||null,
    }));

  return NextResponse.json({
    ok: incoming.status===200 && outgoing.status===200,
    incomingStatus:incoming.status,
    outgoingStatus:outgoing.status,
    incoming:project(incoming.items),
    outgoing:project(outgoing.items),
  },{headers:{'cache-control':'no-store'}});
}
