import { getLaudusReadOnly, LaudusApiError, listLaudus } from '@/lib/integrations/laudus/client';

const FIXED_ASSET_LIST_PATH = '/purchases/fixedAssets/list';
const KNOWN_LIST_FIELDS = [
  'fixedAssetId',
  'name',
  'dateAcquisition',
  'dateRetirement',
  'usefulLife',
  'realizableValue',
  'depreciationType',
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

function objectFromPayload(payload: unknown): Record<string, unknown> | null {
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

function fieldNames(row: unknown) {
  return row && typeof row === 'object' && !Array.isArray(row)
    ? Object.keys(row as Record<string, unknown>).slice(0, 100)
    : [];
}

function costLikeFields(fields: string[]) {
  return fields.filter((field) =>
    /(acquisition|purchase|initial|book|value|cost|amount|residual|realizable|depreciat)/i.test(field),
  );
}

export async function probeLaudusFixedAssetReadiness() {
  try {
    const payload = await listLaudus(FIXED_ASSET_LIST_PATH, {
      options: { offset: 0, limit: 1 },
      fields: [...KNOWN_LIST_FIELDS],
    });
    const rows = rowsFromPayload(payload);
    const first = rows[0] && typeof rows[0] === 'object' && !Array.isArray(rows[0])
      ? rows[0] as Record<string, unknown>
      : null;
    const listFields = fieldNames(first);
    const fixedAssetId = Number(first?.fixedAssetId);

    let detailStatus: number | null = null;
    let detailFields: string[] = [];
    let detailCostFields: string[] = [];

    if (Number.isFinite(fixedAssetId) && fixedAssetId > 0) {
      try {
        const detailPayload = await getLaudusReadOnly(`/purchases/fixedAssets/${fixedAssetId}`);
        const detail = objectFromPayload(detailPayload);
        detailFields = fieldNames(detail);
        detailCostFields = costLikeFields(detailFields);
        detailStatus = 200;
      } catch (error) {
        if (error instanceof LaudusApiError) {
          detailStatus = error.status;
        } else {
          throw error;
        }
      }
    }

    const listCostFields = costLikeFields(listFields);
    return {
      status: 'available' as const,
      selectedPath: FIXED_ASSET_LIST_PATH,
      listFields,
      listCostFields,
      detailStatus,
      detailFields,
      detailCostFields,
      exposesAcquisitionCostField: [...listCostFields, ...detailCostFields].some((field) =>
        /(acquisition.*(cost|value|amount|price)|(cost|value|amount|price).*acquisition)/i.test(field),
      ),
      persisted: false,
      mode: 'read_only' as const,
      calls: detailStatus === null ? 1 : 2,
    };
  } catch (error) {
    if (error instanceof LaudusApiError) {
      return {
        status: 'unavailable' as const,
        selectedPath: FIXED_ASSET_LIST_PATH,
        listStatus: error.status,
        listFields: [],
        listCostFields: [],
        detailStatus: null,
        detailFields: [],
        detailCostFields: [],
        exposesAcquisitionCostField: false,
        persisted: false,
        mode: 'read_only' as const,
        calls: 1,
      };
    }
    throw error;
  }
}
