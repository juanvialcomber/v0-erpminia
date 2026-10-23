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
  const invoiceIds = [...new Set(candidates.map((row) => text(row.invoice_id)).filter(Boolean))];

  let decisions: any[] = [];
  if (invoiceIds.length) {
    const result = await context.supabase
      .from('laudus_match_review_decisions')
      .select('id,invoice_external_id,order_external_id,candidate_status,decision,reason,score,next_score,evidence_snapshot,reviewed_by,reviewed_at')
      .eq('organization_id', context.organizationId)
      .in('invoice_external_id', invoiceIds)
      .order('reviewed_at', { ascending: false });

    if (result.error) {
      console.error('[laudus/match-reviews GET decisions]', result.error);
      return NextResponse.json({ error: 'No se pudieron cargar las decisiones previas.' }, { status: 500 });
    }
    decisions = result.data || [];
  }

  const decided = new Set(decisions.map((row) => `${row.invoice_external_id}:${row.order_external_id}`));
  const pending = candidates.filter((row) => !decided.has(`${row.invoice_id}:${row.order_id}`));

  return NextResponse.json({
    pending,
    reviewed: decisions.slice(0, 8),
    counts: {
      pending: pending.length,
      approved: decisions.filter((row) => row.decision === 'approved').length,
      rejected: decisions.filter((row) => row.decision === 'rejected').length,
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
  const decision = text(body?.decision);
  const suppliedReason = text(body?.reason);

  if (!invoiceExternalId || !orderExternalId || !['approved', 'rejected'].includes(decision)) {
    return NextResponse.json({ error: 'Decisión inválida.' }, { status: 400 });
  }
  if (decision === 'rejected' && suppliedReason.length < 3) {
    return NextResponse.json({ error: 'Indica el motivo del rechazo.' }, { status: 400 });
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

  const reason = decision === 'approved'
    ? suppliedReason || 'Coincidencia verificada por Finanzas.'
    : suppliedReason;

  const result = await context.supabase
    .from('laudus_match_review_decisions')
    .insert({
      organization_id: context.organizationId,
      invoice_external_id: invoiceExternalId,
      order_external_id: orderExternalId,
      candidate_status: candidate.match_status,
      decision,
      reason,
      score: candidate.score,
      next_score: candidate.next_score,
      evidence_snapshot: candidate.evidence || {},
      reviewed_by: context.userId,
      reviewed_at: new Date().toISOString(),
    })
    .select('id,invoice_external_id,order_external_id,candidate_status,decision,reason,score,reviewed_by,reviewed_at')
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
