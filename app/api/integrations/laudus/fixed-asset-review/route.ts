export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type ReviewRow = {
  decision?: string | null;
  rationale?: string | null;
  priority_rank?: number | null;
  evidence_level?: string | null;
  laudus_external_id?: string | null;
  laudus_name?: string | null;
  laudus_manufacturer?: string | null;
  laudus_model?: string | null;
  laudus_serial_number?: string | null;
  acquisition_date?: string | null;
  supplier_name?: string | null;
  invoice_number?: string | null;
  canonical_asset_id?: string | null;
  canonical_asset_code?: string | null;
  canonical_asset_name?: string | null;
  canonical_manufacturer?: string | null;
  canonical_model?: string | null;
  canonical_serial_number?: string | null;
  canonical_license_plate?: string | null;
  canonical_location?: string | null;
  exact_plate_support?: boolean | null;
  exact_serial_support?: boolean | null;
  manufacturer_support?: boolean | null;
  best_name_similarity?: number | null;
  score_gap?: number | null;
  second_name_similarity?: number | null;
  laudus_rows_for_candidate?: number | null;
};

function n(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [review, linked, pending, decisions] = await Promise.all([
      context.supabase.rpc('motil_laudus_fixed_asset_review_queue', {
        p_organization_id: context.organizationId,
        p_limit: 500,
      }),
      context.supabase
        .from('laudus_fixed_assets_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .not('canonical_asset_id', 'is', null),
      context.supabase
        .from('laudus_fixed_assets_service_v1')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', context.organizationId)
        .eq('reconciliation_status', 'pending'),
      context.supabase
        .from('laudus_fixed_asset_review_decisions')
        .select('decision,evidence_level')
        .eq('organization_id', context.organizationId),
    ]);

    if (review.error) throw review.error;
    if (linked.error) throw linked.error;
    if (pending.error) throw pending.error;
    if (decisions.error) throw decisions.error;

    const payload = (review.data || {}) as {
      summary?: Record<string, unknown>;
      queue?: ReviewRow[];
    };
    const queue = Array.isArray(payload.queue) ? payload.queue : [];
    const reviewRows = (decisions.data || []) as Array<{ decision?: string | null; evidence_level?: string | null }>;

    const actionable = queue
      .filter((row) => !row.decision)
      .sort((a, b) =>
        n(a.priority_rank) - n(b.priority_rank)
        || n(b.best_name_similarity) - n(a.best_name_similarity)
        || String(a.laudus_external_id || '').localeCompare(String(b.laudus_external_id || ''), 'es-CL')
      )
      .slice(0, 50)
      .map((row) => ({
        externalId: String(row.laudus_external_id || ''),
        laudus: {
          name: row.laudus_name ? String(row.laudus_name) : null,
          manufacturer: row.laudus_manufacturer ? String(row.laudus_manufacturer) : null,
          model: row.laudus_model ? String(row.laudus_model) : null,
          serialNumber: row.laudus_serial_number ? String(row.laudus_serial_number) : null,
          acquisitionDate: row.acquisition_date ? String(row.acquisition_date) : null,
          supplierName: row.supplier_name ? String(row.supplier_name) : null,
          invoiceNumber: row.invoice_number ? String(row.invoice_number) : null,
        },
        candidate: {
          assetId: row.canonical_asset_id ? String(row.canonical_asset_id) : null,
          code: row.canonical_asset_code ? String(row.canonical_asset_code) : null,
          name: row.canonical_asset_name ? String(row.canonical_asset_name) : null,
          manufacturer: row.canonical_manufacturer ? String(row.canonical_manufacturer) : null,
          model: row.canonical_model ? String(row.canonical_model) : null,
          serialNumber: row.canonical_serial_number ? String(row.canonical_serial_number) : null,
          licensePlate: row.canonical_license_plate ? String(row.canonical_license_plate) : null,
          location: row.canonical_location ? String(row.canonical_location) : null,
        },
        evidence: {
          level: String(row.evidence_level || 'insufficient_evidence'),
          priority: n(row.priority_rank),
          exactPlate: Boolean(row.exact_plate_support),
          exactSerial: Boolean(row.exact_serial_support),
          manufacturer: Boolean(row.manufacturer_support),
          nameSimilarity: n(row.best_name_similarity),
          secondNameSimilarity: n(row.second_name_similarity),
          laudusRowsForCandidate: n(row.laudus_rows_for_candidate),
        },
      }));

    const summary = payload.summary || {};
    const deferredTotal = reviewRows.filter((row) => row.decision === 'defer').length;
    const confirmedTotal = reviewRows.filter((row) => row.decision === 'confirm_candidate').length;
    const rejectedTotal = reviewRows.filter((row) => row.decision === 'reject_candidate').length;

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      readOnly: true,
      canReview: access.canWrite,
      source: 'Laudus + MOTIL',
      summary: {
        laudusAssets: n(summary.laudus_assets),
        canonicalAssets: n(summary.canonical_assets),
        linkedToMotil: linked.count ?? 0,
        pending: pending.count ?? 0,
        candidateRows: n(summary.candidate_rows),
        strongIdentifierCandidates: n(summary.strong_identifier_candidates),
        strongCandidates: n(summary.strong_candidates),
        supportedCandidates: n(summary.supported_candidates),
        candidates: n(summary.candidates),
        manyToOne: n(summary.many_to_one),
        ambiguous: n(summary.ambiguous),
        reviewsRecorded: reviewRows.length,
        deferredTotal,
        confirmedTotal,
        rejectedTotal,
      },
      rows: actionable,
      policy: {
        noAutomaticLink: true,
        noCanonicalMutation: true,
        noLaudusMutation: true,
        humanDecisionRequired: true,
      },
    });
  } catch (error) {
    console.error('[laudus/fixed-asset-review]', error);
    return NextResponse.json(
      { error: 'No fue posible cargar la revisión de activos Laudus.' },
      { status: 500 },
    );
  }
}


const REVIEW_DECISIONS = new Set(['confirm_candidate', 'reject_candidate', 'defer']);

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const body = await request.json().catch(() => null) as {
      externalId?: unknown;
      decision?: unknown;
      rationale?: unknown;
    } | null;

    const externalId = String(body?.externalId || '').trim();
    const decision = String(body?.decision || '').trim();
    const rationale = String(body?.rationale || '').trim();

    if (!externalId) {
      return NextResponse.json({ error: 'Activo Laudus requerido.' }, { status: 400 });
    }
    if (!REVIEW_DECISIONS.has(decision)) {
      return NextResponse.json({ error: 'Decisión de revisión inválida.' }, { status: 400 });
    }
    if (rationale.length < 5 || rationale.length > 500) {
      return NextResponse.json({ error: 'El motivo debe tener entre 5 y 500 caracteres.' }, { status: 400 });
    }

    const { data: existingDecision, error: existingError } = await context.supabase
      .from('laudus_fixed_asset_review_decisions')
      .select('decision,decided_at')
      .eq('organization_id', context.organizationId)
      .eq('laudus_external_id', externalId)
      .maybeSingle();
    if (existingError) throw existingError;
    if (existingDecision) {
      return NextResponse.json({
        error: 'Este activo Laudus ya tiene una decisión registrada.',
        decision: existingDecision.decision,
        decidedAt: existingDecision.decided_at,
      }, { status: 409 });
    }

    const { data: review, error: reviewError } = await context.supabase.rpc(
      'motil_laudus_fixed_asset_review_queue',
      {
        p_organization_id: context.organizationId,
        p_limit: 500,
      },
    );
    if (reviewError) throw reviewError;

    const queue = Array.isArray((review as { queue?: ReviewRow[] } | null)?.queue)
      ? ((review as { queue: ReviewRow[] }).queue || [])
      : [];
    const candidate = queue.find((row) =>
      String(row.laudus_external_id || '') === externalId && !row.decision
    );

    if (!candidate) {
      return NextResponse.json({
        error: 'El candidato ya no está disponible en la cola vigente. Actualiza antes de decidir.',
      }, { status: 409 });
    }

    const candidateAssetId = candidate.canonical_asset_id
      ? String(candidate.canonical_asset_id)
      : null;
    if (decision === 'confirm_candidate' && !candidateAssetId) {
      return NextResponse.json({
        error: 'No existe un activo MOTIL candidato para confirmar.',
      }, { status: 400 });
    }

    if (candidateAssetId) {
      const { data: canonicalAsset, error: canonicalError } = await context.supabase
        .schema('canonical')
        .from('assets')
        .select('id')
        .eq('organization_id', context.organizationId)
        .eq('id', candidateAssetId)
        .maybeSingle();
      if (canonicalError) throw canonicalError;
      if (!canonicalAsset) {
        return NextResponse.json({
          error: 'El activo MOTIL candidato ya no existe en el maestro canónico.',
        }, { status: 409 });
      }
    }

    const candidateSnapshot = {
      laudus: {
        externalId,
        name: candidate.laudus_name || null,
        manufacturer: candidate.laudus_manufacturer || null,
        model: candidate.laudus_model || null,
        serialNumber: candidate.laudus_serial_number || null,
        acquisitionDate: candidate.acquisition_date || null,
        supplierName: candidate.supplier_name || null,
        invoiceNumber: candidate.invoice_number || null,
      },
      candidate: {
        assetId: candidateAssetId,
        code: candidate.canonical_asset_code || null,
        name: candidate.canonical_asset_name || null,
        manufacturer: candidate.canonical_manufacturer || null,
        model: candidate.canonical_model || null,
        serialNumber: candidate.canonical_serial_number || null,
        licensePlate: candidate.canonical_license_plate || null,
        location: candidate.canonical_location || null,
      },
      evidence: {
        level: candidate.evidence_level || null,
        exactPlate: Boolean(candidate.exact_plate_support),
        exactSerial: Boolean(candidate.exact_serial_support),
        manufacturer: Boolean(candidate.manufacturer_support),
        nameSimilarity: n(candidate.best_name_similarity),
        secondNameSimilarity: n(candidate.second_name_similarity),
        scoreGap: n(candidate.score_gap),
        laudusRowsForCandidate: n(candidate.laudus_rows_for_candidate),
      },
    };

    const { data: saved, error: saveError } = await context.supabase
      .from('laudus_fixed_asset_review_decisions')
      .insert({
        organization_id: context.organizationId,
        laudus_external_id: externalId,
        candidate_asset_id: candidateAssetId,
        decision,
        evidence_level: candidate.evidence_level || null,
        name_similarity: candidate.best_name_similarity ?? null,
        score_gap: candidate.score_gap ?? null,
        rationale,
        reviewer_user_id: context.userId,
        candidate_snapshot: candidateSnapshot,
      })
      .select('id,decision,rationale,decided_at')
      .single();
    if (saveError) throw saveError;

    return NextResponse.json({
      ok: true,
      review: saved,
      canonicalMutated: false,
      laudusMutated: false,
    });
  } catch (error) {
    console.error('[laudus/fixed-asset-review POST]', error);
    return NextResponse.json(
      { error: 'No fue posible registrar la decisión de revisión.' },
      { status: 500 },
    );
  }
}
