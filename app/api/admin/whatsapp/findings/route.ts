export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenDb } from '@/lib/messages/greenapi';
import { redactDisallowedWhatsappReports, isExcludedMotilWhatsappGroup } from '@/lib/messages/greenapi-group-scope';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';
import {
  sourceIdsOfFinding, canReviewFinding, reviewedFinding,
} from '@/lib/messages/whatsapp-finding-review.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FINDINGS = 50;

function invalid(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status, headers: GREEN_NO_STORE });
}

async function reportFinding(
  organizationId: string, date: string, index: number,
) {
  if (!DATE.test(date) || !Number.isInteger(index) || index < 0 || index >= MAX_FINDINGS) {
    return { error: 'Fecha o hallazgo inválidos', status: 400 } as const;
  }
  const db = greenDb();
  const { data: report, error } = await db.from('motil_whatsapp_daily_reports')
    .select('id,organization_id,report_date,status,findings,updated_at,generated_at,summary,message_count')
    .eq('organization_id', organizationId).eq('report_date', date).maybeSingle();
  if (error) return { error: 'No se pudo consultar el reporte', status: 503 } as const;
  const { data: groupScope, error: groupError } = await db.from('motil_whatsapp_groups')
    .select('enabled,updated_at,chat_id').eq('organization_id',organizationId).limit(100);
  if (groupError) return { error: 'No se pudo verificar el alcance de grupos', status: 503 } as const;
  if (!groupScope || groupScope.length >= 100) return { error: 'No se pudo verificar el alcance completo de los grupos', status: 503 } as const;
  if (groupScope.some(group => group.enabled && isExcludedMotilWhatsappGroup(group.chat_id))) {
    return { error: 'La configuración contiene una fuente excluida', status: 409 } as const;
  }
  const [scoped] = report
    ? redactDisallowedWhatsappReports([report], groupScope || [])
    : [null];
  if (scoped?.source_scope_stale) {
    return { error: 'El resumen contiene una fuente deshabilitada. Requiere regeneración.', status: 409 } as const;
  }
  const findings = report?.findings;
  if (!report || !Array.isArray(findings) || index >= findings.length) {
    return { error: 'Hallazgo no disponible', status: 404 } as const;
  }
  const finding = findings[index];
  if (!finding || typeof finding !== 'object' || Array.isArray(finding)) {
    return { error: 'Hallazgo con formato inválido', status: 409 } as const;
  }
  return { report, findings, finding } as const;
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId) {
    return auth.response || invalid('Sin permisos', 403);
  }
  if (!whatsappOperationalReviewEnabled()) return invalid('Revisión operacional pendiente de habilitación',503);
  const date = request.nextUrl.searchParams.get('date') || '';
  const index = Number(request.nextUrl.searchParams.get('index') || '-1');
  const resolved = await reportFinding(auth.organizationId, date, index);
  if ('error' in resolved) return invalid(resolved.error || 'No se pudo verificar el hallazgo', resolved.status ?? 500);
  const ids = sourceIdsOfFinding(resolved.finding);
  if (ids.length === 0) {
    return NextResponse.json({
      finding: resolved.finding, sources: [], attachments: [],
      missingSources: [], sourceComplete: false,
    }, { headers: GREEN_NO_STORE });
  }

  const db = greenDb();
  const { data: sources, error: sourceError } = await db.from('motil_whatsapp_messages')
    .select('id,group_id,sender_name,body,message_type,occurred_at,received_at')
    .eq('organization_id', auth.organizationId).in('id', ids)
    .order('occurred_at', { ascending: true }).limit(20);
  if (sourceError) return invalid('No se pudieron recuperar los mensajes originales', 503);
  const groupIds = [...new Set((sources || []).map(source => source.group_id))].slice(0,20);
  let groupNames = new Map<string,string>();
  if (groupIds.length) {
    const { data: groups, error: groupError } = await db.from('motil_whatsapp_groups')
      .select('id,display_name,chat_id').eq('organization_id', auth.organizationId)
      .eq('enabled',true).in('id', groupIds).limit(20);
    if (groupError) return invalid('No se pudo comprobar el origen de los mensajes', 503);
    if ((groups || []).length !== groupIds.length ||
        (groups || []).some(g => isExcludedMotilWhatsappGroup(g.chat_id))) {
      return invalid('Una fuente del hallazgo ya no está autorizada', 409);
    }
    groupNames = new Map((groups || []).map(g => [g.id, g.display_name]));
  }
  const { data: attachments, error: attachError } = await db.from('motil_whatsapp_attachments')
    .select('id,message_id,download_status,scan_status,original_file_name,mime_type')
    .eq('organization_id', auth.organizationId).in('message_id', ids).limit(25);
  if (attachError) return invalid('No se pudo consultar la evidencia multimedia', 503);
  const present = new Set((sources || []).map(source => Number(source.id)));
  return NextResponse.json({
    finding: resolved.finding,
    sources: (sources || []).map(source => ({
      id: source.id, message_type: source.message_type,
      group_name: groupNames.get(source.group_id) || 'Grupo autorizado',
      sender_name: source.sender_name,
      body: typeof source.body === 'string' ? source.body.slice(0,4000) : null,
      occurred_at: source.occurred_at, received_at: source.received_at,
    })),
    attachments: attachments || [],
    missingSources: ids.filter(id => !present.has(id)),
    sourceComplete: ids.length === present.size,
  }, { headers: GREEN_NO_STORE });
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId || !auth.user?.id) {
    return auth.response || invalid('Sin permisos', 403);
  }
  if (!whatsappOperationalReviewEnabled()) return invalid('Revisión operacional pendiente de habilitación',503);
  const body = await request.json().catch(() => null);
  const date = typeof body?.reportDate === 'string' ? body.reportDate : '';
  const index = body?.findingIndex;
  const decision = body?.decision;
  const note = body?.note;
  if (typeof decision !== 'string' || typeof note !== 'string') {
    return invalid('Decisión y comentario requeridos');
  }
  if (note.trim().length < 8 || note.trim().length > 500) {
    return invalid('El comentario debe tener entre 8 y 500 caracteres.');
  }
  const resolved = await reportFinding(auth.organizationId, date, index);
  if ('error' in resolved) return invalid(resolved.error || 'No se pudo verificar el hallazgo', resolved.status ?? 500);
  if (resolved.report.status !== 'ready') {
    return invalid('El informe todavía no admite revisión', 409);
  }
  if (!canReviewFinding(resolved.finding, decision)) {
    return invalid('El hallazgo ya fue revisado o no permite esta transición', 409);
  }

  const db = greenDb();
  if (decision === 'confirmed') {
    const ids = sourceIdsOfFinding(resolved.finding);
    if (!ids.length || !Array.isArray(resolved.finding.source_ids) ||
        ids.length !== resolved.finding.source_ids.length) {
      return invalid('No se puede confirmar sin referencias exactas a los mensajes', 409);
    }
    const { data: sources, error: sourceError } = await db.from('motil_whatsapp_messages')
      .select('id,group_id').eq('organization_id', auth.organizationId)
      .in('id', ids).limit(20);
    if (sourceError) return invalid('Error al comprobar las fuentes', 503);
    if ((sources || []).length !== ids.length) {
      return invalid('Faltan mensajes originales: solicita revisión antes de confirmar', 409);
    }
    const groupIds = [...new Set((sources || []).map(source => source.group_id))];
    const { data: activeGroups, error: groupError } = await db.from('motil_whatsapp_groups')
      .select('id,chat_id').eq('organization_id',auth.organizationId)
      .eq('enabled',true).in('id',groupIds).limit(20);
    if (groupError) return invalid('No se pudo verificar la autorización de las fuentes', 503);
    if ((activeGroups||[]).length !== groupIds.length ||
      (activeGroups||[]).some(group=>isExcludedMotilWhatsappGroup(group.chat_id))) {
      return invalid('Una fuente fue deshabilitada; no se puede confirmar', 409);
    }
  }

  const now = new Date().toISOString();
  let updated;
  try {
    updated = reviewedFinding(resolved.finding, decision, note, String(auth.user.id), now);
  } catch {
    return invalid('Decisión o comentario inválido', 400);
  }
  const findings = resolved.findings.slice();
  findings[index] = updated;

  // Optimistic CAS keeps concurrent reviewers from silently overwriting votes.
  // External message records and canonical OT/production/HSE tables stay untouched.
  const { data: changed, error: saveError } = await db.from('motil_whatsapp_daily_reports')
    .update({ findings, updated_at: now })
    .eq('id', resolved.report.id)
    .eq('organization_id', auth.organizationId)
    .eq('updated_at', resolved.report.updated_at)
    .select('id,updated_at').maybeSingle();
  if (saveError) return invalid('No se pudo guardar la revisión', 503);
  if (!changed) return invalid('Otro revisor actualizó el informe. Recarga antes de continuar.', 409);
  return NextResponse.json({
    ok: true, reportDate: date, findingIndex: index, finding: updated,
    updatedAt: changed.updated_at,
  }, { headers: GREEN_NO_STORE });
}
