export const dynamic = 'force-dynamic';
export const maxDuration = 60;

import { NextRequest, NextResponse } from 'next/server';
import { triageDocumentIntakeBatch } from '@/lib/documents/intake-triage';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.length < 24 || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 });
  }

  try {
    const result = await triageDocumentIntakeBatch(100);
    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    console.error('[document-intake-triage] job failed', error instanceof Error ? error.message : 'unknown');
    return NextResponse.json({ ok: false, error: 'document_intake_triage_unavailable' }, { status: 503 });
  }
}
