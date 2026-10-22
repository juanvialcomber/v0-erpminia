export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';
import { resolveMotilSkillAvailability } from '@/lib/motil-ai/skills/runtime-availability';
import { suggestedPromptsForDomain } from '@/lib/motil-ai/skills/prompt-suggestions';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [inventoryAccess, procurementAccess, financeAccess, maintenanceAccess] = await Promise.all([
      requireModuleAccess(request, MODULE_KEYS.BODEGA_INVENTARIO),
      requireModuleAccess(request, MODULE_KEYS.FIN_COMPRAS),
      requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS),
      requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES),
    ]);
    const allowedDomains = [
      inventoryAccess.authorized ? 'inventory' : null,
      procurementAccess.authorized ? 'procurement' : null,
      financeAccess.authorized ? 'finance' : null,
      maintenanceAccess.authorized ? 'maintenance' : null,
      ['superadmin', 'admin'].includes(String(context.role || '').toLowerCase()) ? 'data_health' : null,
    ].filter(Boolean) as Array<'inventory' | 'procurement' | 'finance' | 'maintenance' | 'data_health'>;

    const runtime = await resolveMotilSkillAvailability(context, allowedDomains);
    const promptsByDomain = Object.fromEntries(
      ['maintenance', 'inventory', 'procurement', 'finance', 'data_health', 'executive']
        .map((domain) => [domain, suggestedPromptsForDomain(runtime.skills, domain)]),
    );

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      sourceState: runtime.sourceState,
      summary: runtime.summary,
      skills: runtime.skills,
      promptsByDomain,
    });
  } catch (error) {
    console.error('[motil-ai/skills/availability]', error);
    return NextResponse.json({ error: 'No fue posible calcular las capacidades disponibles.' }, { status: 500 });
  }
}
