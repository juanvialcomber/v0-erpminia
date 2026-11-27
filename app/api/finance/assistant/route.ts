export const dynamic = 'force-dynamic';

import { NextRequest } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { handlePersistentOperationalDomainAssistant } from '@/lib/intelligence/persistent-operational-domain-assistant';

async function handle(request: NextRequest) {
  const financeAccess = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!financeAccess.authorized) return financeAccess.response;

  const [inventoryAccess, procurementAccess, productionAccess] = await Promise.all([
    requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO),
    requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS),
    requireModuleAccess(request, MODULE_KEYS.PROD_OPERACIONES),
  ]);
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;
  if (financeAccess.organizationId !== context.organizationId) {
    return Response.json({ error: 'Organización no autorizada' }, { status: 403 });
  }

  const allowedDomains = ['finance'] as Array<'finance' | 'inventory' | 'procurement' | 'production'>;
  if (inventoryAccess.authorized) allowedDomains.push('inventory');
  if (procurementAccess.authorized) allowedDomains.push('procurement');
  if (productionAccess.authorized) allowedDomains.push('production');

  return handlePersistentOperationalDomainAssistant({
    request,
    context,
    domain: 'finance',
    allowedDomains,
  });
}

export const GET = handle;
export const POST = handle;
