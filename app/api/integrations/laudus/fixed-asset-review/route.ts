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
  second_name_similarity?: number | null;
  laudus_rows_for_candidate?: number | null;
};

function n(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

async function requireReviewReadAccess(request: NextRequest) {
  const maintenance = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (maintenance.authorized) return { access: maintenance, canDecide: maintenance.canWrite };
  const finance = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  return { access: finance, canDecide: false };
}

export async function GET(request: NextRequest) {
  const resolved = await requireReviewReadAccess(request);
  const access = resolved.access;
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
      canDecide: resolved.canDecide,
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


type ReviewDecision = 'confirm_candidate' | 'reject_candidate' | 'defer';

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const body = await request.json().catch(() => null) as {
    externalId?: string;
    candidateAssetId?: string | null;
    decision?: ReviewDecision;
    rationale?: string | null;
  } | null;

  const externalId = String(body?.externalId || '').trim();
  const candidateAssetId = body?.candidateAssetId ? String(body.candidateAssetId) : null;
  const decision = body?.decision;
  const rationale = String(body?.rationale || '').trim().slice(0, 1000) || null;

  if (!externalId || !decision || !['confirm_candidate', 'reject_candidate', 'defer'].includes(decision)) {
    return NextResponse.json({ error: 'Revisión inválida.' }, { status: 400 });
  }
  if (decision === 'confirm_candidate' && !candidateAssetId) {
    return NextResponse.json({ error: 'La confirmación requiere un candidato MOTIL.' }, { status: 400 });
  }

  try {
    const { data: reviewPayload, error: reviewError } = await context.supabase.rpc('motil_laudus_fixed_asset_review_queue', {
      p_organization_id: context.organizationId,
      p_limit: 500,
    });
    if (reviewError) throw reviewError;

    const payload = (reviewPayload || {}) as { queue?: ReviewRow[] };
    const current = (payload.queue || []).find((row) => String(row.laudus_external_id || '') === externalId);
    if (!current) return NextResponse.json({ error: 'El caso ya no está disponible para revisión.' }, { status: 409 });

    const currentCandidateId = current.canonical_asset_id ? String(current.canonical_asset_id) : null;
    if (decision === 'confirm_candidate' && currentCandidateId !== candidateAssetId) {
      return NextResponse.json({ error: 'El candidato cambió. Recarga la revisión antes de confirmar.' }, { status: 409 });
    }

    const candidateSnapshot = {
      laudus: {
        externalId,
        name: current.laudus_name || null,
        manufacturer: current.laudus_manufacturer || null,
        model: current.laudus_model || null,
        serialNumber: current.laudus_serial_number || null,
        acquisitionDate: current.acquisition_date || null,
        supplierName: current.supplier_name || null,
        invoiceNumber: current.invoice_number || null,
      },
      candidate: {
        assetId: currentCandidateId,
        code: current.canonical_asset_code || null,
        name: current.canonical_asset_name || null,
        manufacturer: current.canonical_manufacturer || null,
        model: current.canonical_model || null,
        serialNumber: current.canonical_serial_number || null,
        licensePlate: current.canonical_license_plate || null,
        location: current.canonical_location || null,
      },
      evidence: {
        level: current.evidence_level || 'insufficient_evidence',
        exactPlate: Boolean(current.exact_plate_support),
        exactSerial: Boolean(current.exact_serial_support),
        manufacturer: Boolean(current.manufacturer_support),
        nameSimilarity: n(current.best_name_similarity),
        scoreGap: n(current.best_name_similarity) - n(current.second_name_similarity),
      },
    };

    const { error: decisionError } = await context.supabase
      .from('laudus_fixed_asset_review_decisions')
      .upsert({
        organization_id: context.organizationId,
        laudus_external_id: externalId,
        candidate_asset_id: currentCandidateId,
        decision,
        evidence_level: String(current.evidence_level || 'insufficient_evidence'),
        name_similarity: n(current.best_name_similarity),
        score_gap: n(current.best_name_similarity) - n(current.second_name_similarity),
        rationale,
        reviewer_user_id: context.userId,
        decided_at: new Date().toISOString(),
        candidate_snapshot: candidateSnapshot,
      }, { onConflict: 'organization_id,laudus_external_id' });

    if (decisionError) throw decisionError;

    const reconciliationStatus =
      decision === 'confirm_candidate'
        ? 'accepted'
        : decision === 'reject_candidate'
          ? 'ignored'
          : 'resolved';
    const resolutionNote = [
      `decision=${decision}`,
      `candidate_asset_id=${currentCandidateId || 'none'}`,
      `reviewer=${context.userName || context.userEmail || context.userId}`,
      `rationale=${rationale || 'sin observación'}`,
      'canonical_mutation=false',
      'laudus_mutation=false',
    ].join(' | ');

    const { error: reconciliationError } = await context.supabase
      .from('data_reconciliation_reviews')
      .update({
        status: reconciliationStatus,
        resolution_note: resolutionNote,
        reviewed_by: context.userId,
        reviewed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', context.organizationId)
      .eq('issue_key', `laudus:fixed_asset_identity:${externalId}`)
      .eq('status', 'open');

    if (reconciliationError) throw reconciliationError;

    return NextResponse.json({
      ok: true,
      decision,
      externalId,
      candidateAssetId: currentCandidateId,
      appliedToCanonical: false,
      policy: 'review_record_only',
    });
  } catch (error) {
    console.error('[laudus/fixed-asset-review:decision]', error);
    return NextResponse.json({ error: 'No fue posible registrar la revisión.' }, { status: 500 });
  }
}
