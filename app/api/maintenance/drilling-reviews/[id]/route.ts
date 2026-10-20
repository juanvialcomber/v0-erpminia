export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const { id } = await params;
    const { data, error } = await context.supabase
      .from('drilling_maintenance_review_queue_v1')
      .select('review_id,source_report_id,canonical_asset_id,asset_code,asset_name,operation_date,review_reason,equipment_status_raw,machine_observations,review_status,linked_work_order_id,has_linked_work_order')
      .eq('organization_id', context.organizationId)
      .eq('review_id', id)
      .maybeSingle();

    if (error) throw error;
    if (!data || data.review_status === 'dismissed') return NextResponse.json({ error: 'Revisión de Sondaje no disponible' }, { status: 404 });

    return NextResponse.json({ review: data, canonical: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'No se pudo obtener la revisión de Sondaje';
    console.error('[maintenance/drilling-reviews:get]', error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
