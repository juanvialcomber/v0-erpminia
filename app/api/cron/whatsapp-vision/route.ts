export const dynamic = 'force-dynamic';
export const maxDuration = 90;
import { NextRequest, NextResponse } from 'next/server';
// Explicit handover gate: disabled unless this deployment is the appointed cron executor.
function cronExecutorEnabled() {
  return process.env.MOTIL_CRON_EXECUTOR_ENABLED === 'true';
}

import { scanGreenApiEvidenceBatch } from '@/lib/messages/greenapi-media';
import { GREEN_NO_STORE } from '@/lib/messages/greenapi';

// Scheduled passive processing. No WhatsApp send methods or canonical OT writes.
export async function GET(request: NextRequest) {
  if (!cronExecutorEnabled()) {
    return NextResponse.json({ error: 'Cron executor disabled on this deployment' }, { status: 503 });
  }

  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401, headers: GREEN_NO_STORE });
  }
  try {
    const result = await scanGreenApiEvidenceBatch();
    return NextResponse.json({ok:true,...result}, {headers:GREEN_NO_STORE});
  } catch(error) {
    console.error('[whatsapp-evidence] job failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ok:false,error:'evidence_worker_unavailable'},
      {status:503,headers:GREEN_NO_STORE});
  }
}
