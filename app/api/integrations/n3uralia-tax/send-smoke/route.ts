import { NextRequest, NextResponse } from 'next/server';
import { POST as sendAccountingMessage } from '@/app/api/integrations/n3uralia-tax/whatsapp-send/route';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const chatId = String(process.env.N3URALIA_ACCOUNTING_WHATSAPP_GROUP_ID || '').trim();
  const token = String(process.env.N3URALIA_ACCOUNTING_SEND_TOKEN || '').trim();
  if (!chatId || !token) {
    return NextResponse.json({ ok: false, error: 'bridge_not_configured' }, { status: 503 });
  }

  const request = new NextRequest('https://motil.local/api/integrations/n3uralia-tax/whatsapp-send', {
    method: 'POST',
    headers: {
      authorization: `Bearer ${token}`,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      chatId,
      message: 'Prueba E2E del puente contable N3uralia: autenticación y envío operativos.',
    }),
  });

  return sendAccountingMessage(request);
}
