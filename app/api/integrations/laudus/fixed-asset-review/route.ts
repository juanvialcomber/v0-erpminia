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
