import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const token = process.env.GREENAPI_WEBHOOK_TOKEN_NEXT?.trim();
  const instance = process.env.GREENAPI_ID_INSTANCE?.trim();
  if (!token || !instance) {
    return NextResponse.json({ ok:false,error:'relay_probe_not_configured' },{status:503});
  }

  const response = await fetch('https://neuralia2.vercel.app/api/whatsapp/webhook',{
    method:'POST',
    headers:{
      authorization:`Bearer ${token}`,
      'content-type':'application/json',
    },
    body:JSON.stringify({
      typeWebhook:'incomingMessageReceived',
      instanceData:{idInstance:Number(instance)},
      timestamp:Math.floor(Date.now()/1000),
      idMessage:`motil-relay-probe-${Date.now()}`,
      senderData:{
        chatId:'999999999999999999@g.us',
        sender:'56900000000@c.us',
        senderName:'relay-probe',
      },
      messageData:{
        typeMessage:'textMessage',
        textMessageData:{textMessage:'relay-probe'},
      },
    }),
    signal:AbortSignal.timeout(30000),
    cache:'no-store',
  });

  const body=await response.text();
  return NextResponse.json({
    ok:response.ok,
    status:response.status,
    response:body.slice(0,1000),
  },{status:response.ok?200:503,headers:{'cache-control':'no-store'}});
}
