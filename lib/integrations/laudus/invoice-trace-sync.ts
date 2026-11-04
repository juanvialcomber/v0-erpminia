import type { SupabaseClient } from '@supabase/supabase-js';
import { getLaudusReadOnly, LaudusApiError } from './client';

const MAX_INVOICES = 5;
const MAX_CALLS = 10;

type Candidate = {
  invoice_external_id: string;
  laudus_purchase_invoice_id: number | string;
};

type Trace = {
  originStep: string | null;
  originId: string | null;
  originDocNumber: string | null;
};

function safeId(value: unknown) {
  const text = String(value ?? '').trim();
  return /^\d{1,12}$/.test(text) ? text : null;
}

function object(value: unknown): Record<string, any> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, any>
    : null;
}

function normalizeTraces(detail: unknown, traceToPayload: unknown): Trace[] {
  const invoice = object(detail);
  const traces: Trace[] = [];

  const items = Array.isArray(invoice?.items) ? invoice!.items : [];
  for (const item of items) {
    const itemObject = object(item);
    const traceFrom = Array.isArray(itemObject?.traceFrom) ? itemObject!.traceFrom : [];
    for (const trace of traceFrom) {
      const row = object(trace);
      if (!row) continue;
      traces.push({
        originStep: row.fromStep == null ? null : String(row.fromStep),
        originId: safeId(row.fromId),
        originDocNumber: safeId(row.fromDocNumber),
      });
    }
  }

  if (traces.length === 0 && Array.isArray(traceToPayload)) {
    for (const trace of traceToPayload) {
      const row = object(trace);
      if (!row) continue;
      traces.push({
        originStep: row.toStep == null ? null : String(row.toStep),
        originId: safeId(row.toId),
        originDocNumber: safeId(row.toDocNumber),
      });
    }
  }

  const seen = new Set<string>();
  return traces.filter((trace) => {
    const key = [trace.originStep || '', trace.originId || '', trace.originDocNumber || ''].join('|');
    if (!trace.originId || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export async function syncLaudusInvoiceTraceEvidence(
  db: SupabaseClient,
  organizationId: string,
) {
  const candidatesResult = await db.rpc('motil_get_laudus_invoice_trace_candidates', {
    p_organization_id: organizationId,
    p_limit: MAX_INVOICES,
  });
  if (candidatesResult.error) throw new Error('No fue posible obtener candidatos de traza Laudus.');

  const candidates = (candidatesResult.data || []) as Candidate[];
  let apiCalls = 0;
  let scanned = 0;
  let tracesPersisted = 0;
  let sourceErrors = 0;

  for (const candidate of candidates) {
    if (apiCalls >= MAX_CALLS) break;
    const laudusId = safeId(candidate.laudus_purchase_invoice_id);
    if (!laudusId) continue;

    let detail: unknown = null;
    let traceTo: unknown = [];
    try {
      detail = await getLaudusReadOnly('/purchases/invoices/' + laudusId);
      apiCalls += 1;

      const itemTraces = normalizeTraces(detail, []);
      if (itemTraces.length === 0 && apiCalls < MAX_CALLS) {
        traceTo = await getLaudusReadOnly('/purchases/invoices/' + laudusId + '/traceTo');
        apiCalls += 1;
      }

      const traces = normalizeTraces(detail, traceTo);
      const persisted = await db.rpc('motil_ingest_laudus_invoice_traces', {
        p_organization_id: organizationId,
        p_invoice_external_id: candidate.invoice_external_id,
        p_laudus_purchase_invoice_id: Number(laudusId),
        p_traces: traces,
      });
      if (persisted.error) throw new Error('No fue posible persistir evidencia de traza Laudus.');

      scanned += 1;
      tracesPersisted += traces.length;
    } catch (error) {
      sourceErrors += 1;
      if (error instanceof LaudusApiError && [404,422].includes(error.status)) {
        const persisted = await db.rpc('motil_ingest_laudus_invoice_traces', {
          p_organization_id: organizationId,
          p_invoice_external_id: candidate.invoice_external_id,
          p_laudus_purchase_invoice_id: Number(laudusId),
          p_traces: [],
        });
        if (!persisted.error) scanned += 1;
        continue;
      }
      throw error;
    }
  }

  const coverage = await db.rpc('motil_laudus_invoice_trace_coverage', {
    p_organization_id: organizationId,
  });
  if (coverage.error) throw new Error('No fue posible calcular cobertura de trazas.');

  return {
    status: candidates.length === 0 ? 'complete' : 'progress',
    candidates: candidates.length,
    scanned,
    tracesPersisted,
    sourceErrors,
    apiCalls,
    coverage: coverage.data || null,
    policy: {
      sourceTracePersistedAsEvidenceOnly: true,
      sourceTraceIsNotPurchaseOrderConfirmation: true,
      sourceTraceIsNotPaymentApproval: true,
      canonicalMutationExecuted: false,
      laudusMutationExecuted: false,
    },
  };
}
