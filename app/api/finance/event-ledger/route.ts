export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.FIN_FINANZAS);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim().slice(0, 200) || null;

    const [eventsResult, overviewResult] = await Promise.all([
      context.supabase.rpc('motil_finance_event_ledger_events_v1', {
        p_organization_id: context.organizationId,
        p_status: status && status !== 'all' ? status : null,
        p_q: q,
      }),
      context.supabase.rpc('motil_finance_event_ledger_overview_v1', {
        p_organization_id: context.organizationId,
      }),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (overviewResult.error) throw overviewResult.error;

    const events = Array.isArray(eventsResult.data) ? eventsResult.data : [];

    return NextResponse.json({
      overview: overviewResult.data || null,
      events,
      capped: events.length === 250,
      certification: {
        origin: 'CANONICAL',
        currency: 'CLP',
        sources: ['canonical.asset_costs', 'canonical.purchase_order_lines'],
      },
    });
  } catch {
    return NextResponse.json(
      { overview: null, events: [], error: 'No se pudo cargar la trazabilidad certificada' },
      { status: 500 },
    );
  }
}
