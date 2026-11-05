import { NextResponse } from 'next/server';
import { greenApiOrigin } from '@/lib/messages/greenapi-host';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const instance = process.env.GREENAPI_ID_INSTANCE?.trim();
  const apiToken = process.env.GREENAPI_API_TOKEN_INSTANCE?.trim();
  const nextWebhookToken = process.env.GREENAPI_WEBHOOK_TOKEN_NEXT?.trim();
  const apiOrigin = greenApiOrigin(process.env.GREENAPI_API_URL);

  if (!instance || !apiToken || !nextWebhookToken) {
    return NextResponse.json({ ok:false, error:'rotation_not_configured' }, { status:503 });
  }

  const response = await fetch(
    `${apiOrigin}/waInstance${instance}/setSettings/${apiToken}`,
    {
      method:'POST',
      headers:{'content-type':'application/json'},
      body:JSON.stringify({
        webhookUrl:'https://neuralia2.vercel.app/api/whatsapp/webhook',
        webhookUrlToken:nextWebhookToken,
        incomingWebhook:'yes',
        outgoingMessageWebhook:'yes',
        outgoingAPIMessageWebhook:'no',
      }),
      signal:AbortSignal.timeout(15000),
      cache:'no-store',
    }
  );

  const payload = await response.json().catch(()=>({}));
  return NextResponse.json({
    ok:response.ok && payload?.saveSettings===true,
    status:response.status,
    saveSettings:payload?.saveSettings===true,
  }, {
    status: response.ok ? 200 : 503,
    headers:{'cache-control':'no-store'}
  });
}
