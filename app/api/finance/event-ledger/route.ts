export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status');
    const q = searchParams.get('q')?.trim();
    const intelligence = context.supabase.schema('intelligence');

    let query = intelligence
      .from('canonical_clp_cost_ledger')
      .select('*')
      .eq('organization_id', context.organizationId)
      .order('event_at', { ascending: false })
      .limit(250);

    if (status && status !== 'all') query = query.eq('recognition_status', status);
    if (q) query = query.or(`description.ilike.%${q}%,source_record_id.ilike.%${q}%,cost_center_code.ilike.%${q}%`);

    const [eventsResult, overviewResult] = await Promise.all([
      query,
      intelligence.from('canonical_finance_overview').select('*').eq('organization_id', context.organizationId).maybeSingle(),
    ]);

    if (eventsResult.error) throw eventsResult.error;
    if (overviewResult.error) {
      console.warn('[finance/event-ledger] overview unavailable', overviewResult.error.message);
    }

    return NextResponse.json({
      overview: overviewResult.error ? null : overviewResult.data || null,
      events: eventsResult.data || [],
      capped: (eventsResult.data || []).length === 250,
      certification: {
        origin: 'CANONICAL',
        currency: 'CLP',
        sources: ['canonical.asset_costs', 'canonical.purchase_order_lines'],
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo cargar la trazabilidad certificada';
    return NextResponse.json({ overview: null, events: [], error: message }, { status: 500 });
  }
}
