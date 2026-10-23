export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type Candidate = {
  invoice_id: string;
  doc_number: string | null;
  supplier_name: string | null;
  invoice_date: string | null;
  order_id: string;
  order_number: string | null;
  order_date: string | null;
  score: number | null;
  next_score: number | null;
  match_status: 'exact_candidate' | 'probable' | 'ambiguous' | 'review';
  evidence: Record<string, unknown>;
};

function text(value: unknown) {
  return String(value ?? '').trim();
}

async function loadCandidates(context: Awaited<ReturnType<typeof getOrganizationContext>>) {
  if (!context.ok) return { data: null, error: new Error('No autorizado') };
  return context.supabase.rpc('motil_laudus_document_match_preview', {
    p_organization_id: context.organizationId,
    p_scope_days: 120,
  });
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const candidateResult = await loadCandidates(context);
  if (candidateResult.error) {
    console.error('[laudus/match-reviews GET candidate]', candidateResult.error);
    return NextResponse.json({ error: 'No se pudo cargar la bandeja de revisión.' }, { status: 500 });
  }

  const candidates = Array.isArray(candidateResult.data?.recent_review)
    ? candidateResult.data.recent_review as Candidate[]
    : [];

  const result = await context.supabase
    .from('laudus_match_review_decisions')
    .select('id,invoice_external_id,order_external_id,candidate_status,decision,reason,reason_code,score,next_score,evidence_snapshot,reviewed_by,reviewed_at,review_started_at,review_duration_ms')
    .eq('organization_id', context.organizationId)
    .order('reviewed_at', { ascending: false })
    .limit(500);

  if (result.error) {
    console.error('[laudus/match-reviews GET decisions]', result.error);
    return NextResponse.json({ error: 'No se pudieron cargar las decisiones previas.' }, { status: 500 });
  }

  const decisions = result.data || [];
  const decided = new Set(decisions.map((row) => `${row.invoice_external_id}:${row.order_external_id}`));
  const pending = candidates.filter((row) => !decided.has(`${row.invoice_id}:${row.order_id}`)).slice(0, 12);
  const approved = decisions.filter((row) => row.decision === 'approved').length;
  const rejected = decisions.filter((row) => row.decision === 'rejected').length;
  const labelled = approved + rejected;
  const calibrationMinimum = 20;
  const measuredDurations = decisions
    .map((row) => Number(row.review_duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);
  const averageReviewSeconds = measuredDurations.length
    ? measuredDurations.reduce((sum, value) => sum + value, 0) / measuredDurations.length / 1000
    : null;
  const rejectionReasons = decisions
    .filter((row) => row.decision === 'rejected' && row.reason_code)
    .reduce<Record<string, number>>((acc, row) => {
      acc[row.reason_code] = (acc[row.reason_code] || 0) + 1;
      return acc;
    }, {});

  return NextResponse.json({
    pending,
    reviewed: decisions.slice(0, 8),
    counts: {
      pending: pending.length,
      approved,
      rejected,
      labelled,
    },
    learning: {
      status: labelled >= calibrationMinimum ? 'ready_for_calibration' : 'collecting_feedback',
      labelled,
      minimum: calibrationMinimum,
      remaining: Math.max(calibrationMinimum - labelled, 0),
      acceptanceRate: labelled > 0 ? approved / labelled : null,
      appliesToScoring: false,
    },
    valueMetrics: {
      measuredReviews: measuredDurations.length,
      averageReviewSeconds,
      rejectionReasons,
      evidenceLevel: measuredDurations.length > 0 ? 'E2' : 'E1',
    },
    sourceModified: false,
    policy: 'human-review-only',
  });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null);
  const invoiceExternalId = text(body?.invoiceExternalId);
  const orderExternalId = text(body?.orderExternalId);
  const event = text(body?.event);
  const decision = text(body?.decision);
  const reasonCode = text(body?.reasonCode);
  const suppliedReason = text(body?.reason);

  if (!invoiceExternalId || !orderExternalId) {
    return NextResponse.json({ error: 'Caso de revisión inválido.' }, { status: 400 });
  }

  const candidateResult = await loadCandidates(context);
  if (candidateResult.error) {
    return NextResponse.json({ error: 'No se pudo revalidar el candidato.' }, { status: 500 });
  }

  const candidates = Array.isArray(candidateResult.data?.recent_review)
    ? candidateResult.data.recent_review as Candidate[]
    : [];
  const candidate = candidates.find(
    (row) => text(row.invoice_id) === invoiceExternalId && text(row.order_id) === orderExternalId,
  );

  if (!candidate) {
    return NextResponse.json(
      { error: 'El candidato cambió o ya no está en la bandeja. Recarga antes de decidir.' },
      { status: 409 },
    );
  }

  if (event === 'shown') {
    const shown = await context.supabase
      .from('laudus_match_review_events')
      .upsert({
        organization_id: context.organizationId,
        invoice_external_id: invoiceExternalId,
        order_external_id: orderExternalId,
        event_type: 'shown',
        actor_id: context.userId,
        candidate_status: candidate.match_status,
        score: candidate.score,
        evidence_snapshot: candidate.evidence || {},
      }, {
        onConflict: 'organization_id,actor_id,invoice_external_id,order_external_id,event_type',
        ignoreDuplicates: true,
      });

    if (shown.error) {
      console.error('[laudus/match-reviews POST shown]', shown.error);
      return NextResponse.json({ error: 'No se pudo registrar el inicio de revisión.' }, { status: 500 });
    }
    return NextResponse.json({ recorded: true, sourceModified: false, canonicalModified: false });
  }

  if (!['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
  }

  const allowedRejectReasons = new Set([
    'wrong_order','quantity_mismatch','price_mismatch','warehouse_mismatch',
    'date_mismatch','insufficient_evidence','other',
  ]);
  if (decision === 'rejected' && !allowedRejectReasons.has(reasonCode)) {
    return NextResponse.json({ error: 'Indica el motivo del rechazo.' }, { status: 400 });
  }
  if (decision === 'rejected' && reasonCode === 'other' && suppliedReason.length < 3) {
    return NextResponse.json({ error: 'Describe brevemente el motivo.' }, { status: 400 });
  }

  const existing = await context.supabase
    .from('laudus_match_review_decisions')
    .select('id,decision,reason,reviewed_at')
    .eq('organization_id', context.organizationId)
    .eq('invoice_external_id', invoiceExternalId)
    .eq('order_external_id', orderExternalId)
    .maybeSingle();

  if (existing.error) {
    console.error('[laudus/match-reviews POST existing]', existing.error);
    return NextResponse.json({ error: 'No se pudo verificar la decisión.' }, { status: 500 });
  }
  if (existing.data) {
    return NextResponse.json({ error: 'Este candidato ya fue revisado.', review: existing.data }, { status: 409 });
  }

  const rejectLabels: Record<string, string> = {
    wrong_order: 'Corresponde a otra OC',
    quantity_mismatch: 'Cantidad no coincide',
    price_mismatch: 'Precio no coincide',
    warehouse_mismatch: 'Bodega no coincide',
    date_mismatch: 'Fecha no corresponde',
    insufficient_evidence: 'Evidencia insuficiente',
    other: 'Otro motivo',
  };

  const shownResult = await context.supabase
    .from('laudus_match_review_events')
    .select('occurred_at')
    .eq('organization_id', context.organizationId)
    .eq('actor_id', context.userId)
    .eq('invoice_external_id', invoiceExternalId)
    .eq('order_external_id', orderExternalId)
    .eq('event_type', 'shown')
    .maybeSingle();

  const reviewedAt = new Date();
  const reviewStartedAt = shownResult.data?.occurred_at ? new Date(shownResult.data.occurred_at) : null;
  const rawDuration = reviewStartedAt ? reviewedAt.getTime() - reviewStartedAt.getTime() : null;
  const reviewDurationMs = rawDuration !== null && rawDuration >= 0
    ? Math.min(rawDuration, 86400000)
    : null;

  const reason = decision === 'approved'
    ? 'Coincidencia verificada por Finanzas.'
    : reasonCode === 'other'
      ? suppliedReason
      : rejectLabels[reasonCode];

  const result = await context.supabase
    .from('laudus_match_review_decisions')
    .insert({
      organization_id: context.organizationId,
      invoice_external_id: invoiceExternalId,
      order_external_id: orderExternalId,
      candidate_status: candidate.match_status,
      decision,
      reason,
      reason_code: decision === 'approved' ? 'approved_match' : reasonCode,
      score: candidate.score,
      next_score: candidate.next_score,
      evidence_snapshot: candidate.evidence || {},
      reviewed_by: context.userId,
      reviewed_at: reviewedAt.toISOString(),
      review_started_at: reviewStartedAt?.toISOString() || null,
      review_duration_ms: reviewDurationMs,
    })
    .select('id,invoice_external_id,order_external_id,candidate_status,decision,reason,reason_code,score,reviewed_by,reviewed_at,review_started_at,review_duration_ms')
    .single();

  if (result.error) {
    console.error('[laudus/match-reviews POST insert]', result.error);
    return NextResponse.json({ error: 'No se pudo guardar la decisión.' }, { status: 500 });
  }

  return NextResponse.json({
    review: result.data,
    sourceModified: false,
    canonicalModified: false,
    message: decision === 'approved'
      ? 'Candidato aprobado como relación de referencia.'
      : 'Candidato rechazado y motivo registrado.',
  });
}
