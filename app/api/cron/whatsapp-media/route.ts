export const dynamic = 'force-dynamic';
export const maxDuration = 60;
import { NextRequest, NextResponse } from 'next/server';
import { downloadGreenApiEvidenceBatch } from '@/lib/messages/greenapi-media';
import { GREEN_NO_STORE } from '@/lib/messages/greenapi';

// Scheduled passive processing. No WhatsApp send methods or canonical OT writes.
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }
  try {
    const result = await downloadGreenApiEvidenceBatch(2);
    return NextResponse.json({ok:true,...result}, {headers:GREEN_NO_STORE});
  } catch(error) {
    console.error('[whatsapp-evidence] job failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ok:false,error:'evidence_worker_unavailable'},
      {status:503,headers:GREEN_NO_STORE});
  }
}
