export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenDb } from '@/lib/messages/greenapi';
import { isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';
import { validOperationalClassification } from '@/lib/messages/whatsapp-finding-review.mjs';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) return auth.response ||
    NextResponse.json({error:'Sin permisos'},{status:403,headers:GREEN_NO_STORE});
  if (!whatsappOperationalReviewEnabled()) return NextResponse.json({error:'Bitácora pendiente de habilitación'},
    {status:503,headers:GREEN_NO_STORE});
  const db = greenDb();
  // Never reveal a previously reviewed log whose source group has now been
  // deactivated. All provenance groups must still be authorized, not only one.
  const { data: allowed, error: scopeError } = await db.from('motil_whatsapp_groups')
    .select('id,chat_id').eq('organization_id',auth.organizationId)
    .eq('enabled',true).limit(51);
  if (scopeError || (allowed || []).length > 50) {
    return NextResponse.json({error:'No se pudo verificar el origen de las novedades'},
      {status:503,headers:GREEN_NO_STORE});
  }
  const ids = (allowed||[]).filter(g=>!isExcludedMotilWhatsappGroup(g.chat_id))
    .map(g=>g.id);
  if (!ids.length) return NextResponse.json({records:[]},{headers:GREEN_NO_STORE});
  const { data, error } = await db.from('motil_whatsapp_operational_log')
    .select('id,report_date,scope,category,reported_state,summary,source_message_ids,recorded_at')
    .eq('organization_id',auth.organizationId)
    .containedBy('source_group_ids',ids)
    .order('recorded_at',{ascending:false}).limit(60);
  if (error) return NextResponse.json({error:'No se pudo consultar la bitácora operacional'},
    {status:503,headers:GREEN_NO_STORE});
  return NextResponse.json({records:data || []},{headers:GREEN_NO_STORE});
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId || !auth.user?.id) return auth.response ||
    NextResponse.json({error:'Sin permisos'},{status:403,headers:GREEN_NO_STORE});

  if (!whatsappOperationalReviewEnabled()) return NextResponse.json({error:'Bitácora pendiente de habilitación'},
    {status:503,headers:GREEN_NO_STORE});
  const body = await request.json().catch(()=>null);
  const reportDate = body?.reportDate;
  const findingIndex = body?.findingIndex;
  const scope = body?.scope;
  const category = body?.category;
  const reportedState = body?.reportedState;
  if (typeof reportDate !== 'string' || !DATE.test(reportDate) ||
      !Number.isInteger(findingIndex) || findingIndex < 0 || findingIndex >= 50 ||
      typeof scope !== 'string' || typeof category !== 'string' ||
      typeof reportedState !== 'string' ||
      !validOperationalClassification(scope,category,reportedState) ||
      !UUID.test(String(auth.user.id))) {
    return NextResponse.json({error:'Clasificación, fecha o revisión inválidas'},
      {status:400,headers:GREEN_NO_STORE});
  }
  // The RPC verifies the confirmed human review and exact tenant message IDs
  // atomically. It inserts only into the operational log, never machinery OT.
  const db = greenDb();
  const { data, error } = await db.rpc('motil_whatsapp_record_operational_finding',{
    p_organization_id:auth.organizationId,
    p_report_date:reportDate,
    p_finding_index:findingIndex,
    p_scope:scope,
    p_category:category,
    p_reported_state:reportedState,
    p_actor_id:auth.user.id,
  });
  if (error) {
    const known = ['human_review_required','source_evidence_invalid',
      'source_messages_missing','source_messages_missing_or_disabled','source_scope_stale','excluded_source_enabled','report_not_ready','report_not_found',
      'invalid_operational_request','invalid_operational_classification',
      'finding_already_recorded_differently'];
    const code = known.find(value => String(error.message || '').includes(value));
    return NextResponse.json({error:
      code === 'human_review_required' ? 'Primero corrobora el mensaje original.' :
      code === 'source_messages_missing' || code === 'source_messages_missing_or_disabled' || code === 'source_evidence_invalid'
        ? 'Faltan evidencias originales válidas.' :
      code === 'finding_already_recorded_differently'
        ? 'La observación ya está registrada con otra clasificación.' :
      code === 'report_not_ready' || code === 'report_not_found' ||
        code === 'source_scope_stale' || code === 'excluded_source_enabled'
        ? 'El resumen requiere regeneración o contiene una fuente deshabilitada.' :
      code === 'invalid_operational_classification'
        ? 'Elige un ámbito y tipo de actividad coherentes.' :
      'No se pudo registrar la observación operacional.'},
      {status:code?409:503,headers:GREEN_NO_STORE});
  }
  return NextResponse.json(data,{headers:GREEN_NO_STORE});
}
