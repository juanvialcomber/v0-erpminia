import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const webhookToken = process.env.GREENAPI_WEBHOOK_TOKEN_NEXT?.trim();
  const groupId = String(process.env.N3URALIA_ACCOUNTING_WHATSAPP_GROUP_ID || '').trim();
  if (!webhookToken || !groupId) {
    return NextResponse.json({ ok:false, error:'verify_not_configured' }, { status:503 });
  }

  const response = await fetch('https://neuralia2.vercel.app/api/whatsapp/webhook',{
    method:'POST',
    headers:{
      authorization:`Bearer ${webhookToken}`,
      'content-type':'application/json',
    },
    body:JSON.stringify({
      typeWebhook:'outgoingMessageReceived',
      instanceData:{idInstance:Number(process.env.GREENAPI_ID_INSTANCE || '0')},
      timestamp:Math.floor(Date.now()/1000),
      idMessage:`n3-verify-${Date.now()}`,
      senderData:{
        chatId:groupId,
        chatName:'N3uralia Spa',
        sender:'56993826127@c.us',
        senderName:'Juan',
      },
      messageData:{
        typeMessage:'textMessage',
        textMessageData:{textMessage:'Hola. Verificación final del agente contable N3uralia.'},
      },
    }),
    signal:AbortSignal.timeout(45000),
    cache:'no-store',
  });

  const text = await response.text();
  return NextResponse.json({
    ok:response.ok,
    status:response.status,
    response:text.slice(0,1200),
  },{
    status:response.ok?200:503,
    headers:{'cache-control':'no-store'}
  });
}
