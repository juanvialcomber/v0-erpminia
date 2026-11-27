import { DANIEL_METRIC_LABELS, danielMasterMetricHref, DANIEL_MASTER_PATH } from '@/lib/finance/daniel-master';
import type { DanielCalculation, DanielMaster, DanielMasterCalculationRun, DanielMasterMetric } from '@/lib/finance/daniel-master';

const monthNames = 'enero febrero marzo abril mayo junio julio agosto septiembre octubre noviembre diciembre'.split(' ');
const namedMonth = new RegExp(`\\b(${monthNames.join('|')})\\b`, 'g');
const monthFormat = new Intl.DateTimeFormat('es-CL', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const money = new Intl.NumberFormat('es-CL', { style: 'currency', currency: 'CLP', currencyDisplay: 'code' });
const number = new Intl.NumberFormat('es-CL', { maximumFractionDigits: 3 });
const percent = new Intl.NumberFormat('es-CL', { style: 'percent', maximumFractionDigits: 2 });

function normalize(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

export function danielMasterQuestion(message: string) {
  const query = normalize(message);
  if (!/\b(maestro|daniel|julio|eerr)\b/.test(query)) return null;
  if (/\b(stock|inventario|contratos?|directorio|tesoreria|pagos?|cuentas por pagar|proveedores?|facturas?|facturacion)\b/.test(query)) return null;

  const codes = Object.entries(DANIEL_METRIC_LABELS)
    .filter(([, label]) => query.includes(normalize(label.replace(/ \(incompleto\)$/, ''))))
    .map(([code]) => code);
  if (/\b(costo[s]? (?:operacionales?|de operacion|total(?:es)?|de gestion)|costo operar|gasto operativo)\b/.test(query)) {
    if (!codes.includes('cost_total_management')) codes.push('cost_total_management');
  }
  if (!codes.length && !/\b(maestro|eerr|cierre|cerrado|conciliacion|cuadra|cuadran|formula[s]?|recalcul\w*|provisional(?:es)?|revision|costos?|produccion)\b/.test(query)) return null;

  const months = [...query.matchAll(namedMonth)].map((match) => monthNames.indexOf(match[0]) + 1);
  for (const match of query.matchAll(/\b20\d{2}-(0[1-9]|1[0-2])\b/g)) months.push(Number(match[1]));
  const years = [...query.matchAll(/\b20\d{2}\b/g)].map((match) => Number(match[0]));
  return { codes, months, years, relativePeriod: /\b(?:hoy|este mes|mes pasado|mes actual)\b/.test(query), provisional: /\bprovisional(?:es)?\b/.test(query) };
}

function display(value: number | null, unit: string | null) {
  if (value === null) return 'sin valor';
  if (unit === 'CLP') return money.format(value);
  if (unit === 'ratio') return percent.format(value);
  return [number.format(value), unit === 't_dry' ? 't secas' : unit].filter(Boolean).join(' ');
}

function detail(metric: DanielMasterMetric, calculation?: DanielCalculation) {
  const label = DANIEL_METRIC_LABELS[metric.code] ?? metric.code;
  const source = `${metric.sheet} · ${metric.cell ?? `fila ${metric.row}`}`;
  const formulaText = calculation && 'formula' in calculation && calculation.formula ? ` Fórmula ${calculation.formula}.` : '';
  const calculated = calculation && 'calculated' in calculation && calculation.status !== 'source_value'
    ? `; recalculado ${display(calculation.calculated, metric.unit)}` : '';
  const status = calculation?.status === 'matched' ? 'Coincide con la fuente'
    : calculation?.status === 'source_value' ? 'Dato de origen'
      : calculation?.status === 'difference' ? 'Diferencia por revisar' : 'Recálculo sin verificar';
  return `• ${label} — reportado ${display(metric.value, metric.unit)}${calculated}. ${status}.${metric.provisional ? ' Provisional.' : ''} ${source}.${formulaText}`;
}

export function answerDanielMaster(
  question: NonNullable<ReturnType<typeof danielMasterQuestion>>,
  master: DanielMaster,
  run: DanielMasterCalculationRun,
) {
  if (!master.document) return { answer: 'Esta organización no tiene el maestro de Daniel registrado.', evidenceRefs: [] };
  const validPeriods = Array.from(new Set(master.metrics.flatMap((metric) => metric.period ? [metric.period] : [])));
  const candidates = validPeriods.filter((period) => {
    const year = Number(period.slice(0, 4));
    const month = Number(period.slice(5, 7));
    return question.months.every((requested) => requested === month)
      && question.years.every((requested) => requested === year);
  });
  const masterRef = { source: 'maestro_daniel', label: 'Abrir maestro', href: DANIEL_MASTER_PATH };
  if (question.relativePeriod || candidates.length !== 1) {
    return {
      answer: `No puedo identificar un período único validable para esta consulta. Períodos cubiertos por los indicadores: ${validPeriods.map((period) => monthFormat.format(new Date(period))).join(', ') || 'ninguno'}.`,
      evidenceRefs: [masterRef],
    };
  }
  const period = candidates[0];
  const metrics = master.metrics.filter((metric) => metric.period === period);
  const provisional = metrics.filter((metric) => metric.provisional);
  const counts = { matched: 0, source_value: 0, difference: 0, blocked: 0 };
  for (const metric of metrics) counts[run.results[metric.id]?.status ?? 'blocked']++;

  const lines = [
    `Maestro de Daniel · ${monthFormat.format(new Date(period))} (período de los indicadores).`,
    `${counts.matched} fórmulas coinciden, ${counts.source_value} datos de origen, ${counts.difference} diferencias y ${counts.blocked} bloqueados. ${provisional.length} indicadores provisionales. El cierre financiero requiere validación de Finanzas.`,
  ];
  if (!master.document.period_start) lines.push('El período del informe completo sigue pendiente de confirmación por la discrepancia entre la portada y el archivo.');

  const selected = question.codes.length
    ? metrics.filter((metric) => question.codes.includes(metric.code))
    : question.provisional ? provisional : [];
  if (selected.length) lines.push(selected.map((metric) => detail(metric, run.results[metric.id])).join('\n'));
  else if (question.codes.length) lines.push('El maestro no registra ese indicador para el período consultado.');
  else if (provisional.length) {
    const names = provisional.map((metric) => DANIEL_METRIC_LABELS[metric.code] ?? metric.code);
    lines.push(`Pendientes de validación financiera: ${names.join(', ')}.`);
  }

  const refs = selected.length ? selected : provisional;
  return {
    answer: lines.join('\n\n'),
    evidenceRefs: [...refs.slice(0, 7).map((metric) => ({
      source: 'maestro_daniel',
      label: `${metric.sheet} · ${metric.cell ?? `fila ${metric.row}`}`,
      href: danielMasterMetricHref(metric.id),
    })), masterRef],
  };
}
