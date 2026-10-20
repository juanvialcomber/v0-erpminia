export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { GREEN_NO_STORE, greenDb } from '@/lib/messages/greenapi';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  if (!access.organizationId) {
    return NextResponse.json({ error: 'Organización no disponible.' }, { status: 403, headers: GREEN_NO_STORE });
  }

  const db = greenDb();
  const { data, error } = await db
    .from('motil_whatsapp_daily_reports')
    .select('report_date,status,message_count')
    .eq('organization_id', access.organizationId)
    .order('report_date', { ascending: false })
    .limit(14);

  if (error) {
    return NextResponse.json(
      { error: 'No se pudieron consultar los mensajes de WhatsApp.' },
      { status: 503, headers: GREEN_NO_STORE },
    );
  }

  return NextResponse.json({
    reports: data || [],
    whatsappReviewEnabled: whatsappOperationalReviewEnabled(),
  }, { headers: GREEN_NO_STORE });
}
