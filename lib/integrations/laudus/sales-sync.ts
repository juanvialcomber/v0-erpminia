import type { SupabaseClient } from '@supabase/supabase-js';
import { LaudusApiError, listLaudusWithOrderFallback } from '@/lib/integrations/laudus/client';

type JsonRow = Record<string, unknown>;

const ENTITY_CONFIG = {
  sales_customer: {
    path: '/sales/customers/list',
    fields: [
      'customerId','name','legalName','VATId','email','modifiedAt',
      'salesman.salesmanId','salesman.name',
    ],
    orderField: 'modifiedAt',
    pages: 2,
  },
  sales_salesman: {
    path: '/sales/salesmen/list',
    fields: ['salesmanId','name','modifiedAt'],
    orderField: 'modifiedAt',
    pages: 1,
  },
  sales_order: {
    path: '/sales/orders/list',
    fields: [
      'salesOrderId','issuedDate','dueDate','deliveryDate','nullDoc','modifiedAt',
      'customer.customerId','customer.name','customer.legalName','customer.VATId',
      'salesman.salesmanId','salesman.name',
    ],
    orderField: 'modifiedAt',
    pages: 2,
  },
  sales_invoice: {
    path: '/sales/invoices/list',
    fields: [
      'salesInvoiceId','docType.docTypeId','docType.name','docNumber',
      'issuedDate','dueDate','nullDoc','modifiedAt',
      'customer.customerId','customer.name','customer.legalName','customer.VATId',
      'salesman.salesmanId','salesman.name',
      'totals.net','totals.VAT','totals.total','totals.currencyCode','totals.parity',
    ],
    orderField: 'modifiedAt',
    pages: 2,
  },
  sales_waybill: {
    path: '/sales/waybills/list',
    fields: [
      'salesWaybillId','docType.docTypeId','docType.name','docNumber',
      'issuedDate','nullDoc','modifiedAt',
      'customer.customerId','customer.name','customer.legalName','customer.VATId',
      'salesman.salesmanId','salesman.name',
    ],
    orderField: 'modifiedAt',
    pages: 2,
  },
  sales_receipt: {
    path: '/sales/receipts/list',
    fields: [
      'receiptId','receiptType','issuedDate','dueDate','modifiedAt',
      'salesInvoices.itemId','salesInvoices.salesInvoiceId','salesInvoices.docNumber',
      'salesInvoices.customer.customerId','salesInvoices.customer.name',
      'salesInvoices.customer.legalName','salesInvoices.originalAmount',
      'salesInvoices.currencyCode','salesInvoices.parityToMainCurrency',
      'salesInvoices.amount','salesInvoices.costCenter.costCenterId',
    ],
    orderField: 'modifiedAt',
    pages: 2,
  },
} as const;

function rowsFromPayload(payload: unknown): JsonRow[] {
  if (Array.isArray(payload)) {
    return payload.filter((row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  if (!payload || typeof payload !== 'object') return [];
  const record = payload as Record<string, unknown>;
  for (const key of ['data', 'items', 'results', 'rows']) {
    if (Array.isArray(record[key])) {
      return (record[key] as unknown[]).filter(
        (row): row is JsonRow => Boolean(row && typeof row === 'object' && !Array.isArray(row)),
      );
    }
  }
  return [];
}

async function fetchEntity(config: typeof ENTITY_CONFIG[keyof typeof ENTITY_CONFIG]) {
  const rows: JsonRow[] = [];
  let apiCalls = 0;
  let fallbackUsed = false;

  for (let page = 0; page < config.pages; page += 1) {
    const listed = await listLaudusWithOrderFallback(config.path, {
      options: { offset: page * 100, limit: 100 },
      fields: [...config.fields],
      orderBy: [{ field: config.orderField, direction: 'DESC' }],
    });
    apiCalls += listed.apiCalls;
    fallbackUsed ||= listed.fallbackUsed;
    const pageRows = rowsFromPayload(listed.payload);
    rows.push(...pageRows);
    if (pageRows.length < 100) break;
  }

  return { rows, apiCalls, fallbackUsed };
}

export async function syncLaudusSalesRaw(
  organizationId: string,
  db: SupabaseClient,
) {
  const results: Record<string, unknown> = {};
  let apiCalls = 0;

  for (const [entityType, config] of Object.entries(ENTITY_CONFIG)) {
    try {
      const fetched = await fetchEntity(config);
      apiCalls += fetched.apiCalls;

      const { data, error } = await db.rpc('motil_ingest_laudus_sales_raw', {
        p_organization_id: organizationId,
        p_entity_type: entityType,
        p_rows: fetched.rows,
      });
      if (error) throw new Error(`Laudus sales staging failed for ${entityType}`);

      results[entityType] = {
        status: 'completed',
        read: fetched.rows.length,
        apiCalls: fetched.apiCalls,
        orderFallbackUsed: fetched.fallbackUsed,
        staging: data || {},
      };
    } catch (error) {
      results[entityType] = {
        status: 'failed',
        message: error instanceof Error ? error.message : 'unknown',
        upstream: error instanceof LaudusApiError
          ? { path: error.path, status: error.status, upstreamCode: error.upstreamCode }
          : null,
      };
    }
  }

  return {
    organizationId,
    status: Object.values(results).some((value: any) => value?.status === 'failed')
      ? 'partial'
      : 'completed',
    apiCalls,
    entities: results,
    stagingOnly: true,
    canonicalMutated: false,
    laudusMutated: false,
  };
}
