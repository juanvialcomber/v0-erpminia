export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { listLaudus } from '@/lib/integrations/laudus/client';
import { withLaudusApiUsageTracking } from '@/lib/integrations/laudus/api-usage';

function rowsFrom(payload: unknown): Record<string, unknown>[] {
  if (Array.isArray(payload)) return payload.filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  if (!payload || typeof payload !== 'object') return [];
  const value = payload as Record<string, unknown>;
  for (const key of ['data','items','results','rows']) {
    if (Array.isArray(value[key])) return (value[key] as unknown[]).filter((row): row is Record<string, unknown> => Boolean(row && typeof row === 'object' && !Array.isArray(row)));
  }
  return [];
}

export async function POST(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS, true);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const result = await withLaudusApiUsageTracking(context.organizationId, async () => {
      const [customersPayload, ordersPayload] = await Promise.all([
        listLaudus('/sales/customers/list', {
          options: { offset: 0, limit: 5 },
          fields: ['customerId','name','legalName','VATId'],
        }),
        listLaudus('/sales/orders/list', {
          options: { offset: 0, limit: 5 },
          fields: ['salesOrderId','issuedDate','customer.name','status'],
          orderBy: [{ field: 'issuedDate', direction: 'DESC' }],
        }),
      ]);

      const customers = rowsFrom(customersPayload);
      const orders = rowsFrom(ordersPayload);

      return {
        customersObserved: customers.length,
        salesOrdersObserved: orders.length,
        usageDetected: customers.length > 0 || orders.length > 0,
        calls: 2,
        persisted: false,
        laudusMutationExecuted: false,
        motilCanonicalMutationExecuted: false,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('[laudus/sales-discovery]', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No fue posible revisar Clientes/Ventas Laudus.' },
      { status: 502 },
    );
  }
}
