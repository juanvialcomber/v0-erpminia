export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

type RouteContext = { params: Promise<{ entity: string; id: string }> };

type EntityConfig = {
  view: string;
  key: string;
};

const ENTITY_CONFIG: Record<string, EntityConfig> = {
  asset: { view: 'certified_asset_financial_summary', key: 'canonical_asset_id' },
  product: { view: 'certified_product_financial_summary', key: 'canonical_product_id' },
  supplier: { view: 'certified_supplier_financial_summary', key: 'supplier_id' },
  'cost-center': { view: 'certified_cost_center_financial_summary', key: 'cost_center_code' },
};

export async function GET(request: NextRequest, { params }: RouteContext) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const { entity, id } = await params;
  const config = ENTITY_CONFIG[entity];
  if (!config) {
    return NextResponse.json({ error: 'Entidad financiera no soportada' }, { status: 400 });
  }

  try {
    const { data, error } = await context.supabase
      .schema('intelligence')
      .from(config.view)
      .select('*')
      .eq('organization_id', context.organizationId)
      .eq(config.key, id)
      .maybeSingle();

    if (error) throw error;

    const summary = data || {
      organization_id: context.organizationId,
      [config.key]: id,
      recognized_event_count: 0,
      committed_event_count: 0,
      recognized_clp: 0,
      committed_clp: 0,
      first_event_at: null,
      last_event_at: null,
    };

    return NextResponse.json({
      data: summary,
      certification: {
        currency: 'CLP',
        origin: 'CANONICAL',
        sources: ['canonical.asset_costs', 'canonical.purchase_order_lines'],
        recognizedAndCommittedAreSeparate: true,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar el resumen financiero certificado';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
