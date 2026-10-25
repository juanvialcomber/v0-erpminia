import { getLaudusReadOnly, LaudusApiError } from '@/lib/integrations/laudus/client';

export type FixedAssetCandidateInput = {
  laudusExternalId: string;
  canonicalAssetId: string | null;
  canonicalAssetCode: string | null;
  canonicalAssetName: string | null;
  evidenceLevel: string;
  exactPlateSupport: boolean;
  exactSerialSupport: boolean;
};

function recordFromPayload(payload: unknown): Record<string, unknown> | null {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'item', 'result']) {
    const candidate = record[key];
    if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
      return candidate as Record<string, unknown>;
    }
  }
  return record;
}

function numberOrNull(value: unknown) {
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stringOrNull(value: unknown) {
  return typeof value === 'string' && value.trim() ? value : null;
}

function depreciationShape(value: unknown) {
  if (Array.isArray(value)) {
    const first = value[0];
    return {
      kind: 'array',
      count: value.length,
      itemFields:
        first && typeof first === 'object' && !Array.isArray(first)
          ? Object.keys(first as Record<string, unknown>).slice(0, 40)
          : [],
    };
  }
  if (value && typeof value === 'object') {
    return {
      kind: 'object',
      fields: Object.keys(value as Record<string, unknown>).slice(0, 40),
    };
  }
  if (typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean') {
    return { kind: typeof value };
  }
  return { kind: value === null ? 'null' : 'missing' };
}

function objectShape(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return { kind: value === null ? 'null' : typeof value, fields: [] as string[] };
  }
  return {
    kind: 'object',
    fields: Object.keys(value as Record<string, unknown>).slice(0, 80),
  };
}

function depreciationSummary(value: unknown) {
  if (!Array.isArray(value)) return null;
  const rows = value.filter(
    (item): item is Record<string, unknown> => Boolean(item && typeof item === 'object' && !Array.isArray(item)),
  );
  if (rows.length === 0) return null;

  const numeric = (row: Record<string, unknown>, key: string) => {
    const value = Number(row[key]);
    return Number.isFinite(value) ? value : null;
  };

  const years = rows.map((row) => numeric(row, 'year')).filter((value): value is number => value !== null);
  const amounts = rows.map((row) => numeric(row, 'amount')).filter((value): value is number => value !== null);
  const accumulated = rows.map((row) => numeric(row, 'accumulated')).filter((value): value is number => value !== null);
  const amountsInflation = rows
    .map((row) => numeric(row, 'amountWithInflationCorrection'))
    .filter((value): value is number => value !== null);
  const accumulatedInflation = rows
    .map((row) => numeric(row, 'accumulatedWithInflationCorrection'))
    .filter((value): value is number => value !== null);
  const percentages = rows.map((row) => numeric(row, 'percentage')).filter((value): value is number => value !== null);

  return {
    rows: rows.length,
    firstYear: years.length ? Math.min(...years) : null,
    lastYear: years.length ? Math.max(...years) : null,
    percentageTotal: percentages.length ? percentages.reduce((sum, value) => sum + value, 0) : null,
    amountTotal: amounts.length ? amounts.reduce((sum, value) => sum + value, 0) : null,
    accumulatedMax: accumulated.length ? Math.max(...accumulated) : null,
    amountWithInflationCorrectionTotal: amountsInflation.length
      ? amountsInflation.reduce((sum, value) => sum + value, 0)
      : null,
    accumulatedWithInflationCorrectionMax: accumulatedInflation.length
      ? Math.max(...accumulatedInflation)
      : null,
  };
}

export async function readLaudusFixedAssetEconomics(candidates: FixedAssetCandidateInput[]) {
  const bounded = candidates.slice(0, 6);
  const results: Array<Record<string, unknown>> = [];

  for (const candidate of bounded) {
    const id = Number(candidate.laudusExternalId);
    if (!Number.isFinite(id) || id <= 0) {
      results.push({
        ...candidate,
        status: 'invalid_external_id',
      });
      continue;
    }

    try {
      const payload = await getLaudusReadOnly(`/purchases/fixedAssets/${id}`);
      const detail = recordFromPayload(payload);
      if (!detail) {
        results.push({ ...candidate, status: 'empty_detail' });
        continue;
      }

      results.push({
        ...candidate,
        status: 'available',
        fixedAssetId: numberOrNull(detail.fixedAssetId),
        name: stringOrNull(detail.name),
        acquisitionDate: stringOrNull(detail.dateAcquisition),
        retirementDate: stringOrNull(detail.dateRetirement),
        acquisitionCost: numberOrNull(detail.acquisitionCost),
        realizableValue: numberOrNull(detail.realizableValue),
        usefulLife: numberOrNull(detail.usefulLife),
        depreciationType: stringOrNull(detail.depreciationType),
        depreciate: typeof detail.depreciate === 'boolean' ? detail.depreciate : null,
        depreciateFromMonthOfAcquisition:
          typeof detail.depreciateFromMonthOfAcquisition === 'boolean'
            ? detail.depreciateFromMonthOfAcquisition
            : null,
        depreciateWithInflationCorrection:
          typeof detail.depreciateWithInflationCorrection === 'boolean'
            ? detail.depreciateWithInflationCorrection
            : null,
        depreciationShape: depreciationShape(detail.depreciation),
        depreciationSummary: depreciationSummary(detail.depreciation),
        purchaseInvoiceLinked: Boolean(detail.purchaseInvoice),
        purchaseInvoiceShape: objectShape(detail.purchaseInvoice),
        invoiceNumber: stringOrNull(detail.invoiceNumber),
      });
    } catch (error) {
      if (error instanceof LaudusApiError) {
        results.push({
          ...candidate,
          status: 'laudus_error',
          laudusStatus: error.status,
        });
        continue;
      }
      throw error;
    }
  }

  return {
    requested: bounded.length,
    available: results.filter((row) => row.status === 'available').length,
    withAcquisitionCost: results.filter(
      (row) => row.status === 'available' && Number(row.acquisitionCost) > 0,
    ).length,
    results,
    persisted: false,
    mode: 'read_only' as const,
  };
}
