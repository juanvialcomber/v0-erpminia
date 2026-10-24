import { getLaudus } from './client';

type JsonRecord = Record<string, unknown>;

export type LaudusInvoiceOrigin = {
  originStep: string | null;
  originId: number | null;
  originDocNumber: number | null;
};

function asRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as JsonRecord
    : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^\d+$/.test(value.trim())) return Number(value);
  return null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

export function extractLaudusPurchaseInvoiceOrigins(payload: unknown): LaudusInvoiceOrigin[] {
  if (!Array.isArray(payload)) return [];

  return payload
    .map((raw) => {
      const row = asRecord(raw);
      if (!row) return null;
      return {
        originStep: asString(row.toStep),
        originId: asInt(row.toId),
        originDocNumber: asInt(row.toDocNumber),
      };
    })
    .filter((row): row is LaudusInvoiceOrigin => row !== null);
}

export async function fetchLaudusPurchaseInvoiceOrigins(purchaseInvoiceId: number) {
  const payload = await getLaudus(`/purchases/invoices/${purchaseInvoiceId}/traceTo`);
  return {
    origins: extractLaudusPurchaseInvoiceOrigins(payload),
    calls: 1,
  };
}
