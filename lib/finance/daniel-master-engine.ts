import type {
  DanielCalculation,
  DanielCalculationIssue,
  DanielMasterCell,
  DanielMasterMetric,
  DanielMasterRow,
} from '@/lib/finance/daniel-master';

export const DANIEL_CALCULATION_COLUMNS: Readonly<Record<string, string>> = {
  COMPARATIVO: 'E',
  EERR: 'E',
  'DATOS PRODUCC, COSTOS Y VENTAS': 'C',
};

type CellValue = number | string | boolean | null;

class CalculationError extends Error {
  readonly reason: DanielCalculationIssue;
  readonly cell: string;

  constructor(reason: DanielCalculationIssue, cell: string) {
    super(reason);
    this.reason = reason;
    this.cell = cell;
  }
}

function calculateColumn(column: string, rows: DanielMasterRow[]) {
  const addresses = new RegExp(`^${column}([1-9][0-9]*)$`);
  const cells = new Map<string, DanielMasterCell>();
  for (const row of rows) {
    const address = `${column}${row.source_row}`;
    const cell = row.source_values.cells[address];
    if (cell) cells.set(address, cell);
  }

  const computed = new Map<string, CellValue>();
  const visiting = new Set<string>();

  function read(address: string): CellValue {
    if (!(Number(addresses.exec(address)?.[1]) <= 1_048_576) || visiting.size >= 128) {
      throw new CalculationError('unsupported_formula', address);
    }
    if (visiting.has(address)) throw new CalculationError('circular_reference', address);
    if (computed.has(address)) return computed.get(address)!;

    const cell = cells.get(address);
    if (cell?.type === 'e') throw new CalculationError('invalid_value', address);
    if (!cell?.formula) return cell?.value ?? null;

    visiting.add(address);
    try {
      const value = evaluate(cell.formula, address);
      computed.set(address, value);
      return value;
    } finally {
      visiting.delete(address);
    }
  }

  function evaluate(formula: string, address: string): number {
    const unsupported = () => new CalculationError('unsupported_formula', address);
    if (!formula.startsWith('=') || formula.length > 1000) throw unsupported();
    const text = formula.slice(1).toUpperCase();
    const tokenPattern = /\s+|\$?[A-Z]{1,3}\$?[1-9]\d*|[A-Z]+|(?:\d+(?:\.\d*)?|\.\d+)(?:E[+-]?\d+)?|[()+*/,:\-]/gy;
    const tokens: string[] = [];
    while (tokenPattern.lastIndex < text.length) {
      const token = tokenPattern.exec(text)?.[0];
      if (token === undefined) throw unsupported();
      if (token.trim()) tokens.push(token.replaceAll('$', ''));
    }

    let position = 0;
    const peek = () => tokens[position];
    function take(expected: string) {
      if (peek() !== expected) return false;
      position++;
      return true;
    }

    function reference(value: string | undefined) {
      if (value && /^[A-Z]{1,3}[1-9]\d*$/.test(value)) return value;
      throw unsupported();
    }

    function sumRange(first: string, second: string) {
      const firstRow = Number(addresses.exec(first)?.[1]);
      const secondRow = Number(addresses.exec(second)?.[1]);
      if (!Number.isFinite(firstRow) || !(secondRow <= 1_048_576) || secondRow < firstRow || secondRow - firstRow >= 1000) {
        throw unsupported();
      }
      let total = 0;
      for (let row = firstRow; row <= secondRow; row++) {
        const value = read(`${column}${row}`);
        if (typeof value === 'number') total += value;
      }
      return total;
    }

    function atom(): number {
      if (take('+')) return atom();
      if (take('-')) return -atom();
      if (take('(')) {
        const value = expression();
        if (!take(')')) throw unsupported();
        return value;
      }
      if (take('SUM')) {
        if (!take('(')) throw unsupported();
        const first = reference(tokens[position++]);
        if (!take(':')) throw unsupported();
        const last = reference(tokens[position++]);
        if (!take(')')) throw unsupported();
        return sumRange(first, last);
      }

      const token = tokens[position++];
      if (token && /^\d|^\.\d/.test(token)) return Number(token);
      const source = reference(token);
      const value = read(source);
      if (value === null) return 0;
      if (typeof value === 'number') return value;
      throw new CalculationError('invalid_value', source);
    }

    function product() {
      let value = atom();
      while (peek() === '*' || peek() === '/') {
        const operator = tokens[position++];
        const right = atom();
        if (operator === '/' && right === 0) throw new CalculationError('division_by_zero', address);
        value = operator === '*' ? value * right : value / right;
      }
      return value;
    }

    function expression() {
      let value = product();
      while (peek() === '+' || peek() === '-') {
        const operator = tokens[position++];
        const right = product();
        value = operator === '+' ? value + right : value - right;
      }
      return value;
    }

    const result = expression();
    if (position !== tokens.length) throw unsupported();
    if (!Number.isFinite(result)) throw new CalculationError('invalid_value', address);
    return result;
  }

  return { cells, read };
}

function agrees(first: number, second: number) {
  const tolerance = Math.max(1, Math.abs(first), Math.abs(second)) * Number.EPSILON * 16;
  return Math.abs(first - second) <= tolerance;
}

export function reconcileDanielMaster(
  metrics: DanielMasterMetric[],
  rowsBySheet: ReadonlyMap<string, DanielMasterRow[]>,
): Record<string, DanielCalculation> {
  const sheets = new Map(Object.entries(DANIEL_CALCULATION_COLUMNS).flatMap(([sheet, column]) => {
    const rows = rowsBySheet.get(sheet);
    return rows ? [[sheet, calculateColumn(column, rows)] as const] : [];
  }));

  return Object.fromEntries(metrics.map((metric): [string, DanielCalculation] => {
    const sheet = sheets.get(metric.sheet);
    const cell = metric.cell ? sheet?.cells.get(metric.cell) : undefined;
    if (!sheet || !cell || !metric.cell || metric.value === null) {
      return [metric.id, { status: 'blocked', reason: 'missing_evidence', cell: metric.cell }];
    }

    try {
      const calculated = sheet.read(metric.cell);
      if (typeof calculated !== 'number' || !Number.isFinite(calculated)) {
        throw new CalculationError('invalid_value', metric.cell);
      }
      const difference = calculated - metric.value;
      const matchesReport = agrees(calculated, metric.value);
      if (!cell.formula && matchesReport) return [metric.id, { status: 'source_value', calculated }];

      const cached = cell.cached_type !== 'e' && typeof cell.cached === 'number' ? cell.cached : null;
      const matchesCache = cached !== null && agrees(calculated, cached);
      return [metric.id, {
        status: matchesReport && matchesCache ? 'matched' : 'difference',
        calculated,
        difference: matchesReport ? 0 : difference,
        cachedDifference: cached === null ? null : matchesCache ? 0 : calculated - cached,
        formula: cell.formula ?? null,
      }];
    } catch (error) {
      if (!(error instanceof CalculationError)) throw error;
      return [metric.id, { status: 'blocked', reason: error.reason, cell: error.cell }];
    }
  }));
}
