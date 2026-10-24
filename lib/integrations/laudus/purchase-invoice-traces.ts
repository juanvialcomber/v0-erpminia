import { getLaudus } from './client';

type JsonRecord = Record<string, unknown>;

export type LaudusInvoiceTrace = {
  itemId: number | null;
  traceId: number | null;
  fromStep: string | null;
  fromId: number | null;
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

export function extractLaudusInvoiceItemTraces(payload: unknown): LaudusInvoiceTrace[] {
  const invoice = asRecord(payload);
  if (!invoice || !Array.isArray(invoice.items)) return [];

  const traces: LaudusInvoiceTrace[] = [];

  for (const rawItem of invoice.items) {
    const item = asRecord(rawItem);
    if (!item || !Array.isArray(item.traceFrom)) continue;
    const itemId = asInt(item.itemId);

    for (const rawTrace of item.traceFrom) {
      const trace = asRecord(rawTrace);
      if (!trace) continue;
      traces.push({
        itemId,
        traceId: asInt(trace.traceId),
        fromStep: asString(trace.fromStep),
        fromId: asInt(trace.fromId),
      });
    }
  }

  return traces;
}

export async function fetchLaudusPurchaseInvoiceItemTraces(purchaseInvoiceId: number) {
  const payload = await getLaudus(`/purchases/invoices/${purchaseInvoiceId}`);
  return {
    traces: extractLaudusInvoiceItemTraces(payload),
    calls: 1,
  };
}
