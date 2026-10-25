import { LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

type ProbeResult = {
  path: string;
  available: boolean;
  status: number | null;
  rows: number | null;
  sampleFields: string[];
  costFields: string[];
};

const CANDIDATE_PATHS = [
  '/purchases/fixedAssets/list',
  '/accounting/fixedAssets/list',
  '/purchases/assets/list',
] as const;

function rowsFromPayload(payload: unknown): unknown[] {
  if (Array.isArray(payload)) return payload;
  if (payload && typeof payload === 'object') {
    const record = payload as Record<string, unknown>;
    for (const key of ['data', 'items', 'results', 'rows']) {
      if (Array.isArray(record[key])) return record[key] as unknown[];
    }
  }
  return [];
}

function fieldNames(row: unknown) {
  return row && typeof row === 'object' && !Array.isArray(row)
    ? Object.keys(row as Record<string, unknown>).slice(0, 80)
    : [];
}

function costLikeFields(fields: string[]) {
  return fields.filter((field) =>
    /(acquisition|purchase|initial|book|value|cost|amount|residual|realizable)/i.test(field),
  );
}

export async function probeLaudusFixedAssetReadiness() {
  const attempts: ProbeResult[] = [];

  for (const path of CANDIDATE_PATHS) {
    try {
      const payload = await listLaudus(path, { options: { offset: 0, limit: 2 } });
      const rows = rowsFromPayload(payload);
      const sampleFields = fieldNames(rows[0]);
      attempts.push({
        path,
        available: true,
        status: 200,
        rows: rows.length,
        sampleFields,
        costFields: costLikeFields(sampleFields),
      });
      break;
    } catch (error) {
      if (error instanceof LaudusApiError) {
        attempts.push({
          path,
          available: false,
          status: error.status,
          rows: null,
          sampleFields: [],
          costFields: [],
        });
        if (error.status === 404) continue;
        break;
      }
      throw error;
    }
  }

  const selected = attempts.find((attempt) => attempt.available) || null;
  return {
    status: selected ? 'available' : 'unavailable',
    selectedPath: selected?.path || null,
    exposesCostField: Boolean(selected?.costFields.length),
    sampleFields: selected?.sampleFields || [],
    costFields: selected?.costFields || [],
    attempts: attempts.map(({ path, available, status }) => ({ path, available, status })),
    persisted: false,
    mode: 'read_only' as const,
  };
}
