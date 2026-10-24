export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { resolveDataHealthAccess } from '@/lib/intelligence/data-health-access';
import { getSupabaseServerClient } from '@/lib/supabase-server';
import { fetchLaudusPurchaseInvoiceOrigins } from '@/lib/integrations/laudus/purchase-invoice-traces';

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;

export async function POST(request: NextRequest) {
  const access = await resolveDataHealthAccess(request);
  if (!access.ok) return access.response;
  if (!access.admin) {
    return NextResponse.json(
      { error: 'La sincronización de trazas Laudus requiere permisos de administración.' },
      { status: 403 },
    );
  }

  const body = await request.json().catch(() => ({}));
  const requestedLimit = Number(body?.limit ?? DEFAULT_LIMIT);
  const limit = Math.min(Math.max(Number.isFinite(requestedLimit) ? Math.trunc(requestedLimit) : DEFAULT_LIMIT, 1), MAX_LIMIT);

  const db = getSupabaseServerClient();
  const { data: candidates, error: candidatesError } = await db.rpc(
    'motil_get_laudus_invoice_trace_candidates',
    { p_organization_id: access.organizationId, p_limit: limit },
  );

  if (candidatesError) {
    console.error('[laudus/invoice-traces/candidates]', candidatesError.message);
    return NextResponse.json({ error: 'No fue posible preparar el lote de trazabilidad Laudus.' }, { status: 500 });
  }

  const rows = Array.isArray(candidates) ? candidates : [];
  let calls = 0;
  let invoicesProcessed = 0;
  let tracesPersisted = 0;
  const failures: Array<{ purchaseInvoiceId: number; status: string }> = [];

  for (const candidate of rows) {
    const purchaseInvoiceId = Number(candidate?.laudus_purchase_invoice_id);
    const invoiceExternalId = String(candidate?.invoice_external_id || '');
    if (!Number.isInteger(purchaseInvoiceId) || purchaseInvoiceId <= 0 || !invoiceExternalId) continue;

    try {
      const result = await fetchLaudusPurchaseInvoiceOrigins(purchaseInvoiceId);
      calls += result.calls;

      const { data, error } = await db.rpc('motil_ingest_laudus_invoice_traces', {
        p_organization_id: access.organizationId,
        p_invoice_external_id: invoiceExternalId,
        p_laudus_purchase_invoice_id: purchaseInvoiceId,
        p_traces: result.origins,
      });

      if (error) throw error;
      invoicesProcessed += 1;
      tracesPersisted += Number(data?.traces_persisted ?? 0);
    } catch (error) {
      const status = error instanceof Error ? error.name : 'unknown_error';
      failures.push({ purchaseInvoiceId, status });
      console.error('[laudus/invoice-traces/sync]', purchaseInvoiceId, status);
    }
  }

  return NextResponse.json({
    status: failures.length === 0 ? 'ok' : invoicesProcessed > 0 ? 'partial' : 'failed',
    source: 'Laudus',
    sourceEndpoint: '/purchases/invoices/{purchaseInvoiceId}/traceTo',
    mode: 'read_only',
    requested: rows.length,
    invoicesProcessed,
    tracesPersisted,
    calls,
    failures,
    canonicalMutated: false,
    laudusMutated: false,
  }, { status: failures.length > 0 && invoicesProcessed === 0 ? 502 : 200 });
}
