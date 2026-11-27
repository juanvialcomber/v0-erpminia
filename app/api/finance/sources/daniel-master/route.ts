import { type NextRequest, NextResponse } from 'next/server';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { DANIEL_CALCULATION_COLUMNS, reconcileDanielMaster } from '@/lib/finance/daniel-master-engine';
import type { DanielMaster, DanielMasterCalculationRun, DanielMasterMetric, DanielMasterRow } from '@/lib/finance/daniel-master';

export const dynamic = 'force-dynamic';

// The audited workbook identity, including the cover/title discrepancy.
const SOURCE_SHA256 = '974066fc0e34031e3386a930947b543af0245dbb4bce4d2c71d05de4106be9cd';
const RAW_ROW = 'daniel_master_raw_row';

function json(data: unknown, status = 200) {
  return NextResponse.json(data, {
    status,
    headers: { 'Cache-Control': 'private, no-store' },
  });
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (access.organizationId !== context.organizationId) {
    return json({ error: 'Organización no autorizada' }, 403);
  }

  const sheet = request.nextUrl.searchParams.get('sheet');
  const row = request.nextUrl.searchParams.get('row');
  const calculate = request.nextUrl.searchParams.get('calculate') === '1';
  if ((calculate && sheet !== null) || (sheet !== null && (!sheet.trim() || sheet.length > 31))
    || (row !== null && (!sheet || !/^[1-9][0-9]{0,6}$/.test(row) || Number(row) > 1_048_576))) {
    return json({ error: 'Hoja o fila inválida' }, 400);
  }

  const fromSource = (table: string, columns: string) => context.supabase.from(table)
    .select(columns)
    .eq('organization_id', context.organizationId)
    .eq('source_file_sha256', SOURCE_SHA256);

  try {
    if (sheet) {
      const { data: registeredSheet, error: sheetError } = await fromSource('production_source_sheet_registry', 'source_sheet')
        .eq('source_sheet', sheet)
        .maybeSingle();
      if (sheetError) throw sheetError;
      if (!registeredSheet) return json({ error: 'Hoja no encontrada' }, 404);

      const rawRows = (columns: string) => fromSource('production_source_normalized_records', columns)
        .eq('domain', 'source_workbook')
        .eq('record_type', RAW_ROW)
        .eq('source_sheet', sheet);

      if (row !== null) {
        const { data, error } = await rawRows('source_row,source_values')
          .eq('source_row', Number(row))
          .maybeSingle<DanielMasterRow>();
        if (error) throw error;
        if (!data) return json({ error: 'Fila no encontrada' }, 404);
        return json(data);
      }

      const { data, error } = await rawRows('source_row')
        .order('source_row')
        .returns<Array<{ source_row: number }>>();
      if (error) throw error;
      return json({ rows: data.map(({ source_row }) => source_row) });
    }

    const { data: document, error: documentError } = await fromSource(
      'production_source_documents', 'source_file,row_count,formula_count,period_start,period_end',
    ).maybeSingle<NonNullable<DanielMaster['document']>>();
    if (documentError) throw documentError;
    if (!document) {
      return calculate ? json({ results: {} } satisfies DanielMasterCalculationRun)
        : json({ document: null, sheets: [], metrics: [] } satisfies DanielMaster);
    }

    const [sheets, metrics] = await Promise.all([
      fromSource('production_source_sheet_registry', 'source_sheet,nonempty_rows,formula_cells,row_level_materialized')
        .order('sheet_index')
        .returns<DanielMaster['sheets']>(),
      fromSource('production_source_normalized_records', 'id,domain,period_start,source_sheet,source_row,source_values,normalized_values')
        .in('domain', ['finance', 'production'])
        .like('record_type', 'daniel\\_monthly\\_v1\\_%')
        .order('period_start')
        .order('source_sheet')
        .order('source_row')
        .returns<Array<{
          id: string;
          domain: DanielMasterMetric['domain'];
          period_start: string | null;
          source_sheet: string;
          source_row: number;
          source_values: { cell_address?: string };
          normalized_values: {
            metric_code: string;
            value?: number;
            unit?: string;
            evidence_status?: string;
            publishable?: boolean;
            value_kind?: string;
          };
        }>>(),
    ]);
    if (sheets.error) throw sheets.error;
    if (metrics.error) throw metrics.error;

    const indicators: DanielMasterMetric[] = metrics.data.map((metric) => ({
      id: metric.id,
      domain: metric.domain,
      code: metric.normalized_values.metric_code,
      period: metric.period_start,
      value: typeof metric.normalized_values.value === 'number' ? metric.normalized_values.value : null,
      unit: metric.normalized_values.unit ?? null,
      provisional: metric.normalized_values.evidence_status === 'PROVISIONAL' || metric.normalized_values.publishable === false,
      formulaCache: metric.normalized_values.value_kind === 'reported_formula_cache',
      sheet: metric.source_sheet,
      row: metric.source_row,
      cell: metric.source_values.cell_address ?? null,
    }));

    if (!calculate) return json({ document, sheets: sheets.data, metrics: indicators } satisfies DanielMaster);

    const rowsBySheet = new Map<string, DanielMasterRow[]>();
    await Promise.all(sheets.data.map(async (entry) => {
      if (!entry.row_level_materialized || !Object.hasOwn(DANIEL_CALCULATION_COLUMNS, entry.source_sheet)
        || !indicators.some((metric) => metric.sheet === entry.source_sheet)) return;

      const { data, error } = await fromSource('production_source_normalized_records', 'source_row,source_values')
        .eq('domain', 'source_workbook')
        .eq('record_type', RAW_ROW)
        .eq('source_sheet', entry.source_sheet)
        .returns<DanielMasterRow[]>();
      if (error) throw error;

      // A complete materialized sheet is the only basis for treating absent cells as blank.
      if (data.length === entry.nonempty_rows && data.every((row) => row.source_values?.cells)) {
        rowsBySheet.set(entry.source_sheet, data);
      }
    }));

    return json({ results: reconcileDanielMaster(indicators, rowsBySheet) } satisfies DanielMasterCalculationRun);
  } catch (error) {
    console.error('Unable to read Daniel finance master', error);
    return json({ error: 'No se pudo consultar el maestro de Finanzas' }, 500);
  }
}
