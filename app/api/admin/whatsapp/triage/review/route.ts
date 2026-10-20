export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/api/guard';
import { GREEN_NO_STORE, greenDb } from '@/lib/messages/greenapi';
import { prepareWhatsappTriage } from '@/lib/messages/whatsapp-triage.mjs';
import { whatsappOperationalReviewEnabled } from '@/lib/messages/whatsapp-operational-feature.mjs';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const DECISIONS = new Set(['approve','reject']);

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (!auth.authorized || !auth.organizationId || !auth.user) {
    return auth.response || NextResponse.json(
      { error: 'Acceso denegado a revisión operacional' },
      { status: 403, headers: GREEN_NO_STORE },
    );
  }
  if (!whatsappOperationalReviewEnabled()) {
    return NextResponse.json(
      { error: 'Revisión operacional pendiente de habilitación' },
      { status: 503, headers: GREEN_NO_STORE },
    );
  }

  const body = await request.json().catch(() => null);
  const date = String(body?.date || '');
  const index = Number(body?.index);
  const decision = String(body?.decision || '');

  if (!DATE.test(date) || !Number.isSafeInteger(index) || index < 0 || !DECISIONS.has(decision)) {
    return NextResponse.json(
      { error: 'Decisión, fecha o hallazgo inválido' },
      { status: 400, headers: GREEN_NO_STORE },
    );
  }

  const db = greenDb();
  const { data: report, error: reportError } = await db
    .from('motil_whatsapp_daily_reports')
    .select('findings')
    .eq('organization_id', auth.organizationId)
    .eq('report_date', date)
    .maybeSingle();

  if (reportError || !report) {
    return NextResponse.json(
      { error: 'No se pudo verificar el informe diario' },
      { status: 503, headers: GREEN_NO_STORE },
    );
  }

  const { data: messages, error: sourceError } = await db.rpc('motil_whatsapp_daily_evidence', {
    p_organization_id: auth.organizationId,
    p_report_date: date,
    p_limit: 251,
  });
  if (sourceError || !Array.isArray(messages)) {
    return NextResponse.json(
      { error: 'No se pudo verificar la evidencia original' },
      { status: 503, headers: GREEN_NO_STORE },
    );
  }

  const routed = prepareWhatsappTriage(messages, Array.isArray(report.findings) ? report.findings : [], { limit: 250 });
  const finding = routed.findings[index];
  if (!finding || !Array.isArray(finding.sourceIds) || finding.sourceIds.length === 0) {
    return NextResponse.json(
      { error: 'El hallazgo no tiene evidencia fuente verificable' },
      { status: 409, headers: GREEN_NO_STORE },
    );
  }

  const sourceById = new Map(messages.map((row: any) => [Number(row.id), row]));
  const missingSource = finding.sourceIds.some((id: number) => !sourceById.has(Number(id)));
  if (missingSource) {
    return NextResponse.json(
      { error: 'La evidencia fuente cambió; recarga antes de decidir' },
      { status: 409, headers: GREEN_NO_STORE },
    );
  }

  const reviewStatus = decision === 'approve' ? 'confirmed' : 'dismissed';
  const reviewedAt = new Date().toISOString();
  const rows = finding.sourceIds.map((sourceId: number) => {
    const source = sourceById.get(Number(sourceId)) as any;
    return {
      organization_id: auth.organizationId,
      message_id: Number(sourceId),
      item_index: index,
      operation_date: date,
      area: String(finding.suggestion?.scope || finding.suggestion?.id || 'needs_routing').slice(0,80),
      activity_kind: String(finding.suggestion?.category || finding.suggestion?.id || 'review_item').slice(0,80),
      description: String(finding.detail || '').slice(0,2000),
      source_excerpt: String(source?.body || '').slice(0,3000),
      review_status: reviewStatus,
      canonical_asset_id: null,
      reviewer_id: auth.user.id,
      reviewed_at: reviewedAt,
      exception_reason: decision === 'reject' ? 'Rechazado por revisión humana' : null,
      updated_at: reviewedAt,
    };
  });

  const { error: upsertError } = await db
    .from('motil_whatsapp_operational_activities')
    .upsert(rows, { onConflict: 'message_id,item_index' });

  if (upsertError) {
    return NextResponse.json(
      { error: 'No se pudo guardar la decisión' },
      { status: 503, headers: GREEN_NO_STORE },
    );
  }

  return NextResponse.json(
    { ok: true, index, reviewStatus, sourceCount: rows.length },
    { headers: GREEN_NO_STORE },
  );
}
