export type DanielMasterDocument = {
  source_file: string;
  row_count: number | null;
  formula_count: number | null;
  period_start: string | null;
  period_end: string | null;
};

export type DanielMasterSheet = {
  source_sheet: string;
  nonempty_rows: number | null;
  formula_cells: number | null;
  row_level_materialized: boolean;
};

export type DanielMasterMetric = {
  id: string;
  domain: 'finance' | 'production';
  code: string;
  period: string | null;
  value: number | null;
  unit: string | null;
  provisional: boolean;
  formulaCache: boolean;
  sheet: string;
  row: number;
  cell: string | null;
};

export type DanielMaster = {
  document: DanielMasterDocument | null;
  sheets: DanielMasterSheet[];
  metrics: DanielMasterMetric[];
};

export type DanielMasterCell = {
  value?: string | number | boolean | null;
  cached?: string | number | boolean | null;
  formula?: string;
  type?: string;
  cached_type?: string;
  format?: string;
};

export type DanielMasterRow = {
  source_row: number;
  source_values: { cells: Record<string, DanielMasterCell> };
};

export type DanielCalculationIssue =
  | 'missing_evidence'
  | 'unsupported_formula'
  | 'invalid_value'
  | 'division_by_zero'
  | 'circular_reference';

export type DanielCalculation =
  | { status: 'matched' | 'difference'; calculated: number; difference: number; cachedDifference: number | null; formula: string | null }
  | { status: 'source_value'; calculated: number }
  | { status: 'blocked'; reason: DanielCalculationIssue; cell: string | null };

export type DanielMasterCalculationRun = {
  results: Record<string, DanielCalculation>;
};

export const DANIEL_METRIC_LABELS: Record<string, string> = {
  operating_revenue: 'Ingresos operacionales',
  concentrate_sales: 'Ventas de concentrado',
  financial_income: 'Ingresos financieros',
  other_nonoperating_income: 'Otros ingresos no operacionales',
  financial_expense: 'Gastos financieros',
  nonoperating_result_reported: 'Resultado no operacional reportado',
  pretax_result_reported_incomplete: 'Resultado antes de impuestos (incompleto)',
  cost_sales: 'Gastos de venta',
  cost_administration_including_sales: 'Costos de administración y ventas',
  cost_plant: 'Costos de planta',
  cost_peumo: 'Costos de Peumo',
  cost_don_jaime: 'Costos de Don Jaime',
  cost_mines: 'Costos de minas',
  cost_exploration: 'Costos de exploración',
  cost_total_management: 'Costo total de gestión',
  extracted_peumo: 'Extracción de Peumo',
  extracted_don_jaime: 'Extracción de Don Jaime',
  extracted_total: 'Extracción total',
  treated_dry: 'Mineral tratado',
  concentrate_produced: 'Concentrado producido',
  fine_copper_produced: 'Cobre fino producido',
  recovery_theoretical: 'Recuperación teórica',
  recovery_effective: 'Recuperación efectiva',
};

export const DANIEL_MASTER_PATH = '/dashboard/finanzas/fuentes/maestro';

export function danielMasterMetricHref(metricId: string) {
  return `${DANIEL_MASTER_PATH}?metric=${encodeURIComponent(metricId)}#evidencia`;
}

export function isDanielMasterEvidenceHref(href: string) {
  return href === DANIEL_MASTER_PATH || href.startsWith(`${DANIEL_MASTER_PATH}?metric=`)
    && /^[a-zA-Z0-9-]+#evidencia$/.test(href.slice(DANIEL_MASTER_PATH.length + '?metric='.length));
}
