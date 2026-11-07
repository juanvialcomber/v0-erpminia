export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

const CONTRACT_RE = /\b(?:IO|EP)-\d{2}\b/gi;
const OC_RE = /\b(?:OC[-\s:]*)?(\d{5})\b/gi;
const LEGAL_HINT_RE = /\b(contrato|estado de pago|avance|factura|oc\b|orden de compra|retenci[oó]n|hito|proveedor|transportista|polvor[ií]n|regal[ií]a|patente)\b/i;

function refs(text: string) {
  const contracts = [...new Set((text.match(CONTRACT_RE) || []).map((value) => value.toUpperCase()))];
  const orders = new Set<string>();
  for (const match of text.matchAll(OC_RE)) orders.add(match[1]);
  return { contracts, purchase_orders: [...orders] };
}

function safeText(...values: unknown[]) {
  return values.filter((value) => typeof value === 'string').join(' ').slice(0, 30000);
}

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const access = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.LEGAL_MODULO);
  if (access !== 'ED' && access !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al módulo Legal' }, { status: 403 });
  }

  const [emailResult, groupsResult] = await Promise.all([
    context.supabase
      .from('motil_email_source_manifest')
      .select('id,gmail_message_id,attachment_index,email_sent_at,email_sender,email_subject,gmail_url,filename,mime_type,source_sha256,domain,download_state,ingest_state,source_cutoff_date,source_profile,source_notes,created_at')
      .eq('organization_id', context.organizationId)
      .or('domain.like.legal_%,email_subject.ilike.%contrato%,filename.ilike.%contrato%')
      .order('email_sent_at', { ascending: false, nullsFirst: false })
      .limit(100),
    context.supabase
      .from('motil_whatsapp_groups')
      .select('id,name,chat_id')
      .eq('organization_id', context.organizationId)
      .eq('enabled', true)
      .limit(50),
  ]);

  if (emailResult.error) return NextResponse.json({ error: 'No se pudo consultar evidencia de correo' }, { status: 503 });
  if (groupsResult.error) return NextResponse.json({ error: 'No se pudo consultar grupos WhatsApp habilitados' }, { status: 503 });

  const groupIds = (groupsResult.data || []).map((row) => row.id);
  const groupById = new Map((groupsResult.data || []).map((row) => [row.id, row]));

  const whatsappResult = groupIds.length
    ? await context.supabase
        .from('motil_whatsapp_messages')
        .select('id,group_id,provider_message_id,sender_name,body,message_type,file_name,occurred_at,received_at')
        .eq('organization_id', context.organizationId)
        .in('group_id', groupIds)
        .order('occurred_at', { ascending: false })
        .limit(500)
    : { data: [], error: null };

  if (whatsappResult.error) return NextResponse.json({ error: 'No se pudo consultar evidencia WhatsApp' }, { status: 503 });

  const whatsappRows = (whatsappResult.data || []).filter((row) => {
    const text = safeText(row.body, row.file_name);
    return LEGAL_HINT_RE.test(text) || CONTRACT_HINT_RE.test(text);
  }).slice(0, 100);

  const whatsappIds = whatsappRows.map((row) => row.id);
  const attachmentResult = whatsappIds.length
    ? await context.supabase
        .from('motil_whatsapp_attachments')
        .select('id,message_id,provider_message_id,original_file_name,mime_type,size_bytes,sha256,download_status,scan_status,extraction_json,created_at')
        .eq('organization_id', context.organizationId)
        .in('message_id', whatsappIds)
        .limit(200)
    : { data: [], error: null };

  if (attachmentResult.error) return NextResponse.json({ error: 'No se pudo consultar adjuntos WhatsApp' }, { status: 503 });
  const attachmentByMessage = new Map((attachmentResult.data || []).map((row) => [String(row.message_id), row]));

  const email = (emailResult.data || []).map((row) => {
    const text = safeText(row.email_subject, row.filename, row.source_notes, JSON.stringify(row.source_profile || {}));
    return {
      source: 'email' as const,
      source_id: `gmail:${row.gmail_message_id}:${row.attachment_index}`,
      occurred_at: row.email_sent_at || row.created_at,
      sender: row.email_sender,
      context: row.email_subject,
      file_name: row.filename,
      mime_type: row.mime_type,
      sha256: row.source_sha256,
      source_url: row.gmail_url,
      ingest_state: row.ingest_state,
      download_state: row.download_state,
      source_cutoff_date: row.source_cutoff_date,
      ...refs(text),
      needs_review: true,
    };
  });

  const whatsapp = whatsappRows.map((row) => {
    const attachment = attachmentByMessage.get(String(row.id));
    const group = groupById.get(row.group_id);
    const extraction = attachment?.extraction_json ? JSON.stringify(attachment.extraction_json) : '';
    const text = safeText(row.body, row.file_name, attachment?.original_file_name, extraction);
    return {
      source: 'whatsapp' as const,
      source_id: `whatsapp:${row.provider_message_id}`,
      occurred_at: row.occurred_at || row.received_at,
      sender: row.sender_name,
      context: group?.name || group?.chat_id || 'WhatsApp',
      file_name: attachment?.original_file_name || row.file_name || null,
      mime_type: attachment?.mime_type || null,
      sha256: attachment?.sha256 || null,
      source_url: attachment?.id ? `/api/admin/whatsapp/evidence/${attachment.id}` : null,
      ingest_state: attachment?.scan_status || 'message_only',
      download_state: attachment?.download_status || 'not_applicable',
      source_cutoff_date: null,
      ...refs(text),
      needs_review: true,
    };
  });

  const queue = [...email, ...whatsapp]
    .sort((a, b) => String(b.occurred_at || '').localeCompare(String(a.occurred_at || '')))
    .slice(0, 150);

  return NextResponse.json({
    data: queue,
    summary: {
      total: queue.length,
      email: email.length,
      whatsapp: whatsapp.length,
      with_contract_reference: queue.filter((item) => item.contracts.length > 0).length,
      with_purchase_order_reference: queue.filter((item) => item.purchase_orders.length > 0).length,
    },
    policy: {
      promotion: 'La cola es evidencia SOURCE/REVIEW. Nunca actualiza avance, pago o contrato automáticamente.',
      matching: 'Los contratos y OC son referencias determinísticas encontradas en texto/extracción; no constituyen atribución financiera.',
    },
  });
}
