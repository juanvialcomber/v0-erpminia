import type { OrganizationSuccessContext } from '@/lib/api/organization-context';
import { DANIEL_CALCULATION_COLUMNS, reconcileDanielMaster } from '@/lib/finance/daniel-master-engine';
import type { DanielMaster, DanielMasterCalculationRun, DanielMasterMetric, DanielMasterRow } from '@/lib/finance/daniel-master';

// The audited workbook identity, including the cover/title discrepancy.
const SOURCE_SHA256 = '974066fc0e34031e3386a930947b543af0245dbb4bce4d2c71d05de4106be9cd';
const RAW_ROW = 'daniel_master_raw_row';

export function danielMasterSource(context: OrganizationSuccessContext) {
  const fromSource = (table: string, columns: string) => context.supabase.from(table)
    .select(columns)
    .eq('organization_id', context.organizationId)
    .eq('source_file_sha256', SOURCE_SHA256);

  const rawRows = (sheet: string, columns: string) => fromSource('production_source_normalized_records', columns)
    .eq('domain', 'source_workbook')
    .eq('record_type', RAW_ROW)
    .eq('source_sheet', sheet);

  async function read(): Promise<DanielMaster> {
    const { data: document, error: documentError } = await fromSource(
      'production_source_documents', 'source_file,row_count,formula_count,period_start,period_end',
    ).maybeSingle<NonNullable<DanielMaster['document']>>();
    if (documentError) throw documentError;
    if (!document) return { document: null, sheets: [], metrics: [] };
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

    return { document, sheets: sheets.data, metrics: indicators };
  }

  async function calculate(master: DanielMaster): Promise<DanielMasterCalculationRun> {
    const rowsBySheet = new Map<string, DanielMasterRow[]>();
    await Promise.all(master.sheets.map(async (entry) => {
      if (!entry.row_level_materialized || !Object.hasOwn(DANIEL_CALCULATION_COLUMNS, entry.source_sheet)
        || !master.metrics.some((metric) => metric.sheet === entry.source_sheet)) return;

      const { data, error } = await rawRows(entry.source_sheet, 'source_row,source_values')
        .returns<DanielMasterRow[]>();
      if (error) throw error;

      // A complete materialized sheet is the only basis for treating absent cells as blank.
      if (data.length === entry.nonempty_rows && data.every((row) => row.source_values?.cells)) {
        rowsBySheet.set(entry.source_sheet, data);
      }
    }));

    return { results: reconcileDanielMaster(master.metrics, rowsBySheet) };
  }

  return { fromSource, rawRows, read, calculate };
}
