import { NextResponse } from 'next/server';
import { greenRequest } from '@/lib/messages/greenapi';

export const dynamic = 'force-dynamic';

export async function GET() {
  if (process.env.VERCEL_ENV !== 'preview') {
    return new NextResponse(null, { status: 404 });
  }

  const chatId = String(process.env.N3URALIA_ACCOUNTING_WHATSAPP_GROUP_ID || '').trim();
  if (!chatId) {
    return NextResponse.json({ ok: false, error: 'group_not_configured' }, { status: 503 });
  }

  try {
    const result = await greenRequest('sendMessage', {
      chatId,
      message: 'Prueba del agente contable N3uralia: canal de respuesta operativo.',
    });

    return NextResponse.json({
      ok: true,
      idMessage: typeof result?.idMessage === 'string' ? result.idMessage : null,
    }, { headers: { 'cache-control': 'no-store' } });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      error: error instanceof Error ? error.message : 'send_failed',
    }, { status: 503, headers: { 'cache-control': 'no-store' } });
  }
}
