export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const PAGE_SIZE = 50;

function pageNumber(value: string | null) {
  const parsed = Number(value || '1');
  return Number.isInteger(parsed) && parsed > 0 ? parsed : 1;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const url = new URL(request.url);
  const page = pageNumber(url.searchParams.get('page'));
  const query = String(url.searchParams.get('q') || '').trim();
  const status = String(url.searchParams.get('status') || 'all').trim();
  const start = (page - 1) * PAGE_SIZE;
  const end = start + PAGE_SIZE - 1;

  const { data: source, error: sourceError } = await context.supabase
    .from('motil_finance_workbook_imports')
    .select('id,filename,source_cutoff_date,review_status,metadata,created_at')
    .eq('organization_id', context.organizationId)
    .eq('source_kind', 'fixed_asset_depreciation_model')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) {
    return NextResponse.json({
      source: null,
      page,
      pageSize: PAGE_SIZE,
      total: 0,
      rows: [],
    });
  }

  let rowsQuery = context.supabase
    .from('motil_finance_asset_stage')
    .select('id,source_sheet,source_row,record_kind,description,acquisition_date,historical_asset,updated_asset,net_book_value,depreciation_current,total_accum_depr,remaining_life_months,cost_center_raw,canonical_asset_id,identity_status,identity_basis,source_payload', { count: 'exact' })
    .eq('organization_id', context.organizationId)
    .eq('import_id', source.id)
    .order('source_sheet', { ascending: true })
    .order('source_row', { ascending: true })
    .range(start, end);

  if (status === 'linked') rowsQuery = rowsQuery.not('canonical_asset_id', 'is', null);
  if (status === 'unresolved') rowsQuery = rowsQuery.is('canonical_asset_id', null);
  if (status === 'conflict') rowsQuery = rowsQuery.not('canonical_asset_id', 'is', null).contains('source_payload', { economic_identity_conflict: true });
  if (query) rowsQuery = rowsQuery.ilike('description', `%${query.replace(/[%_]/g, '')}%`);

  const { data: rows, count, error: rowsError } = await rowsQuery;
  if (rowsError) return NextResponse.json({ error: rowsError.message }, { status: 500 });

  const metadata = source.metadata && typeof source.metadata === 'object'
    ? source.metadata as Record<string, unknown>
    : {};
  const stage = metadata.stage && typeof metadata.stage === 'object'
    ? metadata.stage as Record<string, unknown>
    : {};

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    source: {
      id: source.id,
      filename: source.filename,
      cutoffDate: source.source_cutoff_date,
      reviewStatus: source.review_status,
    },
    summary: {
      sourceRows: Number(stage.rows || 0),
      linkedRows: Number(stage.identity_linked_rows || 0),
      linkedAssets: Number(stage.identity_linked_assets || 0),
      singleAssets: Number(stage.identity_single_assets || 0),
      conflictAssets: Number(stage.identity_conflict_assets || 0),
    },
    page,
    pageSize: PAGE_SIZE,
    total: count || 0,
    rows: rows || [],
    semantics: {
      registry: 'Registro financiero completo de la fuente de Daniel. Una fila puede existir aquí aunque todavía no tenga contraparte operacional en Ficha 360.',
      linked: 'La identidad está enlazada a un activo canónico MOTIL.',
      unresolved: 'La fila se conserva como evidencia financiera aunque todavía no exista una identidad operacional verificable.',
      conflict: 'Más de una fila financiera quedó asociada al mismo activo; Daniel debe resolver cuál representa el valor aplicable.',
    },
  });
}
