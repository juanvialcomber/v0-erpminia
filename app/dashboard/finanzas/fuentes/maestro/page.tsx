'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
import useSWR from 'swr';
import useSWRMutation from 'swr/mutation';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { StatePanel } from '@/components/ui/state-panel';
import type { DanielCalculation, DanielCalculationIssue, DanielMaster, DanielMasterCalculationRun, DanielMasterMetric, DanielMasterRow } from '@/lib/finance/daniel-master';

const API = '/api/finance/sources/daniel-master';
const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP' });
const percent = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });
const month = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });

const groups = [
  { domain: 'finance', title: 'Ingresos, costos y resultados' },
  { domain: 'production', title: 'Producción y recuperación' },
] as const;

const labels: Record<string, string> = {
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

async function fetcher<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.error || 'No se pudo consultar la fuente');
  return payload;
}

function displayMetric({ value, unit }: Pick<DanielMasterMetric, 'value' | 'unit'>) {
  if (value === null) return 'Sin dato';
  if (unit === 'CLP') return money.format(value);
  if (unit === 'ratio') return percent.format(value);
  return [number.format(value), unit === 't_dry' ? 't secas' : unit].filter(Boolean).join(' ');
}

const issueLabels: Record<DanielCalculationIssue, string> = {
  missing_evidence: 'Evidencia incompleta',
  unsupported_formula: 'Fórmula fuera de alcance',
  invalid_value: 'Valor de origen inválido',
  division_by_zero: 'División por cero',
  circular_reference: 'Referencia circular',
};

function CalculationResult({ result, unit }: { result?: DanielCalculation; unit: string | null }) {
  if (!result) return 'Sin resultado';
  if (result.status === 'blocked') {
    return (
      <>
        <Badge variant="outline">Bloqueado</Badge>
        <p className="mt-1 text-xs text-muted-foreground">{issueLabels[result.reason]}{result.cell ? ` · ${result.cell}` : ''}</p>
      </>
    );
  }
  if (result.status === 'source_value') return <span className="text-muted-foreground">Dato de origen</span>;

  return (
    <>
      <span className="whitespace-nowrap tabular-nums">{displayMetric({ value: result.calculated, unit })}</span>
      <Badge className="ml-2" variant={result.status === 'matched' ? 'secondary' : 'outline'}>
        {result.status === 'matched' ? 'Coincide' : 'Diferencia'}
      </Badge>
      {result.status === 'difference' && (
        <div className="mt-1 space-y-1 text-xs text-muted-foreground">
          {result.difference !== 0 && <p>Respecto al valor reportado {displayMetric({ value: result.difference, unit })}</p>}
          {result.formula && result.cachedDifference !== 0 && <p>
            {result.cachedDifference === null ? 'Resultado de fórmula guardado ausente o inválido'
              : `Respecto al resultado guardado ${displayMetric({ value: result.cachedDifference, unit })}`}
          </p>}
        </div>
      )}
    </>
  );
}

export default function DanielMasterPage() {
  const [selection, setSelection] = useState<{ sheet: string; row?: number; cell?: string } | null>(null);
  const evidenceSection = useRef<HTMLElement>(null);
  const { data, error, isLoading, mutate } = useSWR<DanielMaster>(API, fetcher);
  const calculation = useSWRMutation<DanielMasterCalculationRun>(`${API}?calculate=1`, fetcher);
  const results = calculation.data?.results;
  const counts = Object.values(results ?? {}).reduce((totals, result) => {
    totals[result.status]++;
    return totals;
  }, { matched: 0, difference: 0, blocked: 0, source_value: 0 });
  const sheet = selection?.sheet ?? data?.sheets.find((entry) => entry.source_sheet === 'EERR')?.source_sheet
    ?? data?.sheets[0]?.source_sheet;
  const sheetInfo = data?.sheets.find((entry) => entry.source_sheet === sheet);
  const rowsUrl = sheet ? `${API}?sheet=${encodeURIComponent(sheet)}` : null;
  const rows = useSWR<{ rows: number[] }>(rowsUrl, fetcher);
  const row = selection?.row ?? rows.data?.rows[0];
  const evidence = useSWR<DanielMasterRow>(rowsUrl && row ? `${rowsUrl}&row=${row}` : null, fetcher);

  if (isLoading) return <StatePanel tone="loading" title="Cargando el maestro de costos y producción" />;
  if (error || !data) return <StatePanel tone="error" title="No se pudo cargar el maestro" description={error?.message} actions={<Button variant="outline" onClick={() => void mutate()}>Reintentar</Button>} />;
  if (!data.document) return <StatePanel title="Esta organización no tiene el maestro registrado" />;

  const { document, metrics, sheets } = data;
  const selectedAddress = selection?.cell;
  const selectedCell = selectedAddress ? evidence.data?.source_values.cells?.[selectedAddress] : undefined;
  const selectedValue = selectedCell?.formula ? selectedCell.cached : selectedCell?.value;
  const evidenceError = rows.error ?? evidence.error;
  const cells = Object.entries(evidence.data?.source_values.cells ?? {})
    .sort(([first], [second]) => first.length - second.length || first.localeCompare(second));

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 pb-10">
      <header className="space-y-2 border-b pb-4">
        <Link href="/dashboard/finanzas/fuentes" className="text-sm text-muted-foreground hover:underline">Fuentes y calidad</Link>
        <h1 className="text-2xl font-semibold tracking-tight">Maestro de costos y producción</h1>
        <p className="text-sm text-muted-foreground">{document.source_file} · {sheets.length} hojas · {number.format(document.row_count ?? 0)} filas</p>
        <Badge variant="outline">Pendiente de revisión financiera</Badge>
        {!document.period_start && (
          <p className="max-w-3xl text-sm text-muted-foreground">
            La portada indica junio de 2026 y el nombre del archivo indica julio de 2026. Cada indicador muestra el período de su columna de origen. El período del informe completo sigue pendiente de confirmación.
          </p>
        )}
      </header>

      <section className="space-y-3 rounded-md border p-4" aria-label="Conciliación de indicadores">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold">Conciliación de indicadores</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Recalcula los indicadores con las celdas de julio. Las cifras conservan su estado de revisión financiera.
            </p>
          </div>
          <Button type="button" onClick={() => void calculation.trigger().catch(() => {})}
            disabled={calculation.isMutating || !metrics.length}>
            {calculation.isMutating ? 'Recalculando…' : 'Recalcular indicadores'}
          </Button>
        </div>
        {calculation.error ? (
          <p role="alert" className="text-sm text-destructive">No se pudo completar el recálculo. Intenta nuevamente.</p>
        ) : results && (
          <p role="status" className="text-sm text-muted-foreground">
            {counts.matched} fórmulas coinciden · {counts.source_value} datos de origen · {counts.difference} diferencias · {counts.blocked} bloqueados
          </p>
        )}
      </section>

      {groups.map(({ domain, title }) => {
        const items = metrics.filter((metric) => metric.domain === domain);
        return (
          <section key={domain} className="space-y-2" aria-label={title}>
            <h2 className="text-base font-semibold">{title}</h2>
            {items.length ? (
              <div className="overflow-x-auto rounded-md border">
                <table className="w-full text-left text-sm">
                  <thead className="bg-muted/50 text-muted-foreground">
                    <tr>
                      {['Indicador', 'Período', 'Valor reportado', ...(results ? ['Recálculo'] : []), 'Celda de origen'].map((label) => (
                        <th key={label} scope="col" className="px-4 py-2 font-medium">{label}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {items.map((metric) => (
                      <tr key={metric.id}>
                        <th scope="row" className="px-4 py-2 font-medium">{labels[metric.code] ?? metric.code}</th>
                        <td className="whitespace-nowrap px-4 py-2">{metric.period ? month.format(new Date(metric.period)) : 'Sin período'}</td>
                        <td className="px-4 py-2">
                          <span className="whitespace-nowrap tabular-nums">{displayMetric(metric)}</span>
                          {metric.provisional && <Badge variant="outline" className="ml-2">Provisional</Badge>}
                          {metric.formulaCache && <p className="text-xs text-muted-foreground">Resultado guardado de fórmula</p>}
                        </td>
                        {results && <td className="px-4 py-2"><CalculationResult result={results[metric.id]} unit={metric.unit} /></td>}
                        <td className="px-4 py-2">
                          <a
                            href="#evidencia"
                            className="text-primary underline-offset-4 hover:underline"
                            onClick={() => {
                              setSelection({ sheet: metric.sheet, row: metric.row, cell: metric.cell ?? undefined });
                              evidenceSection.current?.focus({ preventScroll: true });
                            }}
                          >
                            {metric.sheet} · {metric.cell ?? `fila ${metric.row}`}
                          </a>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <StatePanel title="Sin indicadores registrados" />}
          </section>
        );
      })}

      <section ref={evidenceSection} id="evidencia" aria-labelledby="evidencia-titulo" tabIndex={-1} className="scroll-mt-24 space-y-3 rounded-md border p-4">
        <h2 id="evidencia-titulo" className="text-base font-semibold">Evidencia del maestro</h2>
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex min-w-0 flex-col gap-1 text-sm">
            Hoja
            <select
              className="h-9 max-w-full rounded-md border bg-background px-2"
              value={sheet ?? ''}
              onChange={(event) => setSelection({ sheet: event.target.value })}
            >
              {sheets.map((entry) => <option key={entry.source_sheet}>{entry.source_sheet}</option>)}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-sm">
            Fila original
            <select
              className="h-9 rounded-md border bg-background px-2"
              value={row ?? ''}
              disabled={!rows.data?.rows.length}
              onChange={(event) => sheet && setSelection({ sheet, row: Number(event.target.value) })}
            >
              {!rows.data?.rows.length && <option value="">—</option>}
              {rows.data?.rows.map((sourceRow) => <option key={sourceRow}>{sourceRow}</option>)}
            </select>
          </label>
          {sheetInfo && (
            <p className="pb-2 text-xs text-muted-foreground">
              {number.format(sheetInfo.nonempty_rows ?? 0)} filas · {number.format(sheetInfo.formula_cells ?? 0)} fórmulas
            </p>
          )}
        </div>

        {evidenceError && (
          <StatePanel tone="error" title="No se pudo cargar la evidencia" description={evidenceError.message}
            actions={<Button variant="outline" onClick={() => {
              if (rows.error) void rows.mutate();
              if (evidence.error) void evidence.mutate();
            }}>Reintentar</Button>} />
        )}
        {!evidenceError && (rows.isLoading || evidence.isLoading) && <StatePanel tone="loading" title="Cargando evidencia" />}
        {!evidenceError && rows.data?.rows.length === 0 && <StatePanel title={sheetInfo?.row_level_materialized ? 'Hoja sin filas' : 'Hoja pendiente de materialización'} />}
        {!evidenceError && selectedAddress && evidence.data && (
          <div role="status" className="space-y-3 rounded-md border border-primary/30 bg-primary/5 p-4">
            <h3 className="font-semibold">{sheet} · {selectedAddress}</h3>
            {selectedCell ? (
              <dl className="grid gap-3 text-sm sm:grid-cols-2">
                <div>
                  <dt className="text-muted-foreground">Valor guardado</dt>
                  <dd className="break-all font-mono">{selectedValue == null ? '—' : String(selectedValue)}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">Fórmula original</dt>
                  <dd className="break-all font-mono">{selectedCell.formula ?? 'Valor ingresado'}</dd>
                </div>
              </dl>
            ) : <p className="text-sm text-muted-foreground">La fila guardada no contiene esta celda.</p>}
          </div>
        )}
        {!evidenceError && cells.length > 0 && (
          <details key={`${sheet}:${row}:${selectedAddress ?? ''}`} open={!selectedAddress}
            className="rounded-md border">
            <summary className="cursor-pointer px-3 py-2 text-sm font-medium">
              Celdas de la fila {row} ({cells.length})
            </summary>
            <div className="max-h-[36rem] overflow-auto border-t">
              <table className="w-full text-left text-sm">
                <caption className="sr-only">Celdas de la fila seleccionada</caption>
                <thead className="sticky top-0 bg-muted text-muted-foreground">
                  <tr>
                    {['Celda', 'Valor guardado', 'Fórmula original'].map((label) => (
                      <th key={label} scope="col" className="px-3 py-2 font-medium">{label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {cells.map(([address, cell]) => {
                    const sourceValue = cell.formula ? cell.cached : cell.value;
                    return (
                      <tr key={address} className={selection?.cell === address ? 'bg-primary/10' : undefined}>
                        <th scope="row" className="px-3 py-2 font-mono font-medium">{address}</th>
                        <td className="px-3 py-2 tabular-nums">
                          {sourceValue == null ? '—' : String(sourceValue)}
                        </td>
                        <td className="break-all px-3 py-2 font-mono text-xs">{cell.formula ?? '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>
    </div>
  );
}
