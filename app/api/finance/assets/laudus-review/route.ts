export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const DECISIONS = new Set(['confirm_candidate','reject_candidate','defer']);

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rawLimit = Number(request.nextUrl.searchParams.get('limit') || 100);
  const limit = Math.min(Math.max(Number.isFinite(rawLimit) ? Math.trunc(rawLimit) : 100,1),500);

  const { data, error } = await context.supabase.rpc('motil_laudus_fixed_asset_review_queue', {
    p_organization_id: context.organizationId,
    p_limit: limit,
  });

  if (error) {
    console.error('[finance/assets/laudus-review/get]', error.message);
    return NextResponse.json({ error: 'No se pudo cargar la revisión de activos Laudus.' }, { status: 500 });
  }

  return NextResponse.json(data || { source:'Laudus + MOTIL', read_only_source:true, summary:{}, queue:[], canonical_mutated:false, laudus_mutated:false });
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => ({}));
  const laudusExternalId = String(body?.laudusExternalId || '').trim();
  const candidateAssetId = body?.candidateAssetId ? String(body.candidateAssetId) : null;
  const decision = String(body?.decision || '');
  const rationale = String(body?.rationale || '').trim().slice(0,1000);

  if (!laudusExternalId || !DECISIONS.has(decision)) {
    return NextResponse.json({ error:'Decisión o activo Laudus inválido.' }, { status:400 });
  }
  if (decision === 'confirm_candidate' && !candidateAssetId) {
    return NextResponse.json({ error:'Confirmar requiere un activo candidato.' }, { status:400 });
  }

  const { data: queue, error: queueError } = await context.supabase.rpc('motil_laudus_fixed_asset_review_queue', {
    p_organization_id: context.organizationId,
    p_limit: 500,
  });
  if (queueError) return NextResponse.json({ error:'No se pudo verificar el candidato.' }, { status:500 });

  const candidate = Array.isArray(queue?.queue)
    ? queue.queue.find((row: any) => String(row.laudus_external_id) === laudusExternalId)
    : null;

  if (!candidate) return NextResponse.json({ error:'El candidato ya no está disponible para revisión.' }, { status:409 });
  if (candidateAssetId && String(candidate.canonical_asset_id) !== candidateAssetId) {
    return NextResponse.json({ error:'El candidato cambió; recarga la revisión.' }, { status:409 });
  }

  const snapshot = {
    laudus_name:candidate.laudus_name,
    laudus_manufacturer:candidate.laudus_manufacturer,
    laudus_model:candidate.laudus_model,
    laudus_serial_number:candidate.laudus_serial_number,
    canonical_asset_id:candidate.canonical_asset_id,
    canonical_asset_code:candidate.canonical_asset_code,
    canonical_asset_name:candidate.canonical_asset_name,
    best_name_similarity:candidate.best_name_similarity,
    second_name_similarity:candidate.second_name_similarity,
    score_gap:candidate.score_gap,
    evidence_level:candidate.evidence_level,
    acquisition_cost:candidate.acquisition_cost,
    supplier_name:candidate.supplier_name,
    invoice_number:candidate.invoice_number,
  };

  const { error } = await context.supabase
    .from('laudus_fixed_asset_review_decisions')
    .upsert({
      organization_id:context.organizationId,
      laudus_external_id:laudusExternalId,
      candidate_asset_id:candidateAssetId,
      decision,
      evidence_level:candidate.evidence_level,
      name_similarity:candidate.best_name_similarity,
      score_gap:candidate.score_gap,
      rationale:rationale || null,
      reviewer_user_id:access.user.id,
      decided_at:new Date().toISOString(),
      candidate_snapshot:snapshot,
    }, { onConflict:'organization_id,laudus_external_id' });

  if (error) {
    console.error('[finance/assets/laudus-review/post]', error.message);
    return NextResponse.json({ error:'No se pudo guardar la decisión.' }, { status:500 });
  }

  return NextResponse.json({
    ok:true,
    decision,
    laudusExternalId,
    canonicalMutated:false,
    laudusMutated:false,
    nextStep:'La decisión queda como evidencia; no modifica el activo canónico.',
  });
}
