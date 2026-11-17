// Source fields remain absent until the operator explicitly enters a value.
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const NUMERIC = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

export function parsePlantNumber(value) {
  if (value == null || typeof value === 'boolean') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const normalized = value.trim().replace(',', '.');
  if (!NUMERIC.test(normalized)) return null;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

function dateIsValid(value) {
  if (typeof value !== 'string' || !ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

const REQUIRED = [
  ['treatedWetMetricTons', 'Mineral tratado húmedo', 0, Infinity],
  ['mineralMoisturePct', 'Humedad del mineral', 0, 100],
  ['headGrade', 'Ley de cabeza', 0, 100.0000001],
];
const OPTIONAL = [
  ['concentrateGrade', 'Ley del concentrado', 0, 100.0000001],
  ['tailingsGrade', 'Ley del relave', 0, 100.0000001],
  ['galigherGrade', 'Ley Galigher', 0, 100.0000001],
  ['concentrateWetMetricTons', 'Concentrado húmedo', 0, Infinity],
  ['concentrateMoisturePct', 'Humedad del concentrado', 0, 100],
  ['dispatchedMetricTons', 'Despacho húmedo', 0, Infinity],
  ['dispatchMoisturePct', 'Humedad del despacho', 0, 100],
  ['dispatchGrade', 'Ley del despacho', 0, 100.0000001],
];

export function validatePlantEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ok: false, error: 'Registro de planta inválido.' };
  }
  const operationDate = typeof input.operationDate === 'string' ? input.operationDate.trim() : '';
  const shiftCode = typeof input.shiftCode === 'string' ? input.shiftCode.trim() : '';
  if (!dateIsValid(operationDate)) return { ok: false, error: 'Ingrese una fecha de operación válida.' };
  if (!shiftCode || shiftCode.length > 40) return { ok: false, error: 'Ingrese un turno válido (máximo 40 caracteres).' };

  const parsed = {};
  for (const [field, label, min, max] of REQUIRED) {
    const number = parsePlantNumber(input[field]);
    if (number === null || number < min || number >= max) {
      return { ok: false, error: label + ': ingrese un valor válido' + (max === 100 ? ' entre 0 y menos de 100 %.' : max > 100 && max < Infinity ? ' entre 0 y 100 %.' : ' no negativo.') };
    }
    parsed[field] = number;
  }
  for (const [field, label, min, max] of OPTIONAL) {
    const value = input[field];
    if (value == null || (typeof value === 'string' && value.trim() === '')) {
      parsed[field] = null;
      continue;
    }
    const number = parsePlantNumber(value);
    if (number === null || number < min || number >= max) {
      return { ok: false, error: label + ': valor inválido; verifique unidad y rango.' };
    }
    parsed[field] = number;
  }
  return {
    ok: true,
    payload: {
      mode: 'plant_metallurgy',
      operationDate, shiftCode, ...parsed,
      lotNumber: typeof input.lotNumber === 'string' ? input.lotNumber.trim() || null : null,
      blendCode: typeof input.blendCode === 'string' ? input.blendCode.trim() || null : null,
    },
  };
}

const validPercent = (value, upperExclusive = false) =>
  value !== null && value >= 0 && (upperExclusive ? value < 100 : value <= 100);
const finiteNonNegative = (value) => value !== null && value >= 0;

export function calculatePlantPreview(input) {
  const wet = parsePlantNumber(input?.treatedWetMetricTons);
  const mineralMoisture = parsePlantNumber(input?.mineralMoisturePct);
  const head = parsePlantNumber(input?.headGrade);
  const concWet = parsePlantNumber(input?.concentrateWetMetricTons);
  const concMoisture = parsePlantNumber(input?.concentrateMoisturePct);
  const concGrade = parsePlantNumber(input?.concentrateGrade);
  const tail = parsePlantNumber(input?.tailingsGrade);
  const dispatchWet = parsePlantNumber(input?.dispatchedMetricTons);
  const dispatchMoisture = parsePlantNumber(input?.dispatchMoisturePct);
  const dispatchGrade = parsePlantNumber(input?.dispatchGrade);

  const mineralDry = finiteNonNegative(wet) && validPercent(mineralMoisture, true)
    ? wet * (1 - mineralMoisture / 100) : null;
  const feedFine = mineralDry !== null && validPercent(head)
    ? mineralDry * head / 100 : null;
  const concentrateDry = finiteNonNegative(concWet) && validPercent(concMoisture, true)
    ? concWet * (1 - concMoisture / 100) : null;
  const concentrateFine = concentrateDry !== null && validPercent(concGrade)
    ? concentrateDry * concGrade / 100 : null;
  const candidateGradeRecovery = validPercent(head) && head > 0 && validPercent(concGrade)
    && validPercent(tail) && concGrade > tail
    ? ((head - tail) * concGrade) / ((concGrade - tail) * head) * 100 : null;
  const candidateBalanceRecovery = feedFine !== null && feedFine > 0
    && concentrateFine !== null ? concentrateFine / feedFine * 100 : null;
  const validRecovery = (candidate) => candidate !== null
    && Number.isFinite(candidate) && candidate >= 0 && candidate <= 100;
  const gradeRecovery = validRecovery(candidateGradeRecovery) ? candidateGradeRecovery : null;
  const balanceRecovery = validRecovery(candidateBalanceRecovery) ? candidateBalanceRecovery : null;
  const dispatchFine = finiteNonNegative(dispatchWet) && validPercent(dispatchMoisture, true)
    && validPercent(dispatchGrade) ? dispatchWet * (1 - dispatchMoisture / 100) * dispatchGrade / 100 : null;

  return {
    mineralDry, feedFine, concentrateDry, concentrateFine, gradeRecovery, balanceRecovery, dispatchFine,
    requiresReview: (candidateGradeRecovery !== null && !validRecovery(candidateGradeRecovery))
      || (candidateBalanceRecovery !== null && !validRecovery(candidateBalanceRecovery)),
  };
}
