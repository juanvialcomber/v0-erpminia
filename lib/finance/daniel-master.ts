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
