export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const PAGE_SIZE = 1000;
const MAX_ROWS = 5000;

type LaudusFixedAssetRow = {
  external_id: string | null;
  name: string | null;
  acquisition_date: string | null;
  retirement_date: string | null;
  acquisition_cost: number | string | null;
  useful_life: number | string | null;
  realizable_value: number | string | null;
  depreciation_type: string | null;
  manufacturer: string | null;
  model: string | null;
  serial_number: string | null;
  supplier_name: string | null;
  invoice_number: string | null;
  location: string | null;
  canonical_asset_id: string | null;
  reconciliation_status: string | null;
  synced_at: string | null;
};

type CanonicalAssetRow = {
  id: string;
  asset_code: string | null;
  name: string | null;
  operational_status: string | null;
  criticality: string | null;
};

function hasText(value: unknown) {
  return typeof value === 'string' && value.trim().length > 0;
}

function reviewTier(row: LaudusFixedAssetRow) {
  if (hasText(row.serial_number)) return { key: 'physical_identifier', label: 'Serie disponible', rank: 3 };
  if (hasText(row.model) || hasText(row.manufacturer)) return { key: 'model_identifier', label: 'Marca / modelo', rank: 2 };
  return { key: 'source_reference_only', label: 'Referencia fuente', rank: 1 };
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const rows: LaudusFixedAssetRow[] = [];
  let sourceError: unknown = null;

  for (let from = 0; from < MAX_ROWS; from += PAGE_SIZE) {
    const { data, error } = await context.supabase
      .from('laudus_fixed_assets_service_v1')
      .select('external_id,name,acquisition_date,retirement_date,acquisition_cost,useful_life,realizable_value,depreciation_type,manufacturer,model,serial_number,supplier_name,invoice_number,location,canonical_asset_id,reconciliation_status,synced_at')
      .eq('organization_id', context.organizationId)
      .order('external_id', { ascending: true })
      .range(from, from + PAGE_SIZE - 1);

    if (error) {
      sourceError = error;
      break;
    }

    const page = (data || []) as LaudusFixedAssetRow[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) break;
  }

  if (sourceError) {
    console.error('[finance/laudus-fixed-assets-review]', sourceError);
    return NextResponse.json({ error: 'No se pudo cargar activos fijos observados en Laudus' }, { status: 500 });
  }

  const matchedIds = [...new Set(
    rows
      .filter((row) => row.reconciliation_status === 'matched' && row.canonical_asset_id)
      .map((row) => String(row.canonical_asset_id)),
  )];

  const canonicalRows: CanonicalAssetRow[] = [];
  for (let index = 0; index < matchedIds.length; index += 50) {
    const chunk = matchedIds.slice(index, index + 50);
    const { data, error } = await context.supabase
      .from('canonical_assets_current')
      .select('id,asset_code,name,operational_status,criticality')
      .eq('organization_id', context.organizationId)
      .in('id', chunk);

    if (error) {
      console.error('[finance/laudus-fixed-assets-review:canonical]', error);
      return NextResponse.json({ error: 'No se pudo resolver activos canónicos vinculados' }, { status: 500 });
    }
    canonicalRows.push(...((data || []) as CanonicalAssetRow[]));
  }

  const canonicalById = new Map(canonicalRows.map((row) => [String(row.id), row]));

  const pendingRows = rows.filter((row) => row.reconciliation_status === 'pending');
  const activePendingRows = pendingRows
    .filter((row) => !row.retirement_date)
    .map((row) => ({ ...row, reviewTier: reviewTier(row) }))
    .sort((a, b) =>
      b.reviewTier.rank - a.reviewTier.rank ||
      String(b.acquisition_date || '').localeCompare(String(a.acquisition_date || '')) ||
      String(a.external_id || '').localeCompare(String(b.external_id || '')),
    );

  const matchedRows = rows
    .filter((row) => row.reconciliation_status === 'matched' && row.canonical_asset_id)
    .map((row) => ({
      ...row,
      canonicalAsset: canonicalById.get(String(row.canonical_asset_id)) || null,
    }))
    .sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''), 'es'));

  const summary = {
    totalRows: rows.length,
    matched: rows.filter((row) => row.reconciliation_status === 'matched').length,
    pending: pendingRows.length,
    conflict: rows.filter((row) => row.reconciliation_status === 'conflict').length,
    ignored: rows.filter((row) => row.reconciliation_status === 'ignored').length,
    activePending: activePendingRows.length,
    activePendingWithSerial: activePendingRows.filter((row) => hasText(row.serial_number)).length,
    activePendingWithModel: activePendingRows.filter((row) => hasText(row.model) || hasText(row.manufacturer)).length,
    retiredPending: pendingRows.filter((row) => Boolean(row.retirement_date)).length,
    acquisitionCostAvailable: rows.filter((row) => Number(row.acquisition_cost || 0) > 0).length,
  };

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source: {
      name: 'Laudus',
      readOnly: true,
      syncedAt: rows.reduce<string | null>((latest, row) => {
        const value = row.synced_at ? String(row.synced_at) : null;
        if (!value) return latest;
        return !latest || value > latest ? value : latest;
      }, null),
    },
    summary,
    reviewRows: activePendingRows.slice(0, 30),
    matchedRows: matchedRows.slice(0, 20),
    semantics: {
      pending: 'Registro de activo fijo Laudus sin contraparte canónica verificada en MOTIL.',
      physical_identifier: 'La fuente trae número de serie. Es mejor evidencia para revisión, pero no autoriza un match automático.',
      model_identifier: 'La fuente trae marca o modelo. Sirve para acotar candidatos, no para identificar una unidad por sí sola.',
      source_reference_only: 'La fila sólo conserva referencia contable/documental. Requiere evidencia operacional adicional.',
      cost: summary.acquisitionCostAvailable === 0
        ? 'La fuente observada no expone costo de adquisición material utilizable; MOTIL no lo infiere.'
        : 'Los costos observados se consideran fuente Laudus y no reemplazan la economía canónica sin conciliación.',
    },
  });
}
