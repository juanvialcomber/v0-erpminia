export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { getModuleAccessLevel, MODULE_KEYS } from '@/lib/api/module-access';

export async function GET(request: NextRequest) {
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const level = await getModuleAccessLevel(context.userId, context.role, MODULE_KEYS.MANT_OPERACIONES);
  if (level !== 'ED' && level !== 'LEC') {
    return NextResponse.json({ error: 'No tienes acceso al registro de residuos de mantenimiento.' }, { status: 403 });
  }

  try {
    const status = request.nextUrl.searchParams.get('status');
    let query = context.supabase
      .from('maintenance_waste_records')
      .select('*')
      .eq('organization_id', context.organizationId)
      .order('generated_at', { ascending: false })
      .limit(250);

    if (status && ['generated','stored','removed','closed'].includes(status)) query = query.eq('status', status);
    const { data: waste, error } = await query;
    if (error) throw error;

    const ids = Array.from(new Set((waste || []).map((row) => row.work_order_id).filter(Boolean)));
    const assetIds = Array.from(new Set((waste || []).map((row) => row.canonical_asset_id).filter(Boolean)));
    const orders = ids.length
      ? await context.supabase
          .from('maintenance_work_orders')
          .select('id,work_order_number,title,workshop_site,canonical_asset_id,asset_id')
          .eq('organization_id', context.organizationId)
          .in('id', ids.slice(0, 250))
      : { data: [], error: null };
    if (orders.error) throw orders.error;

    const assets = assetIds.length
      ? await context.supabase
          .from('maintenance_canonical_assets_v1')
          .select('id,asset_code,name,asset_type,category,manufacturer,model,license_plate,cost_center_code,validation_status')
          .eq('organization_id', context.organizationId)
          .in('id', assetIds.slice(0, 250))
      : { data: [], error: null };
    if (assets.error) throw assets.error;

    const orderMap = new Map((orders.data || []).map((row) => [row.id, row]));
    const assetMap = new Map((assets.data || []).map((row) => [row.id, row]));
    const rows = (waste || []).map((row) => ({
      ...row,
      work_order: orderMap.get(row.work_order_id) || null,
      asset: row.canonical_asset_id ? assetMap.get(row.canonical_asset_id) || null : null,
    }));
    const summary = {
      total: rows.length,
      generated: rows.filter((row) => row.status === 'generated').length,
      stored: rows.filter((row) => row.status === 'stored').length,
      removed: rows.filter((row) => row.status === 'removed').length,
      closed: rows.filter((row) => row.status === 'closed').length,
      hazardousOpen: rows.filter((row) => row.classification === 'hazardous' && row.status !== 'closed').length,
      toClassify: rows.filter((row) => row.classification === 'to_classify' && row.status !== 'closed').length,
    };

    return NextResponse.json({ rows, summary, complianceCertified: false, canEdit: level === 'ED' });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : 'No se pudo cargar el registro de residuos.' }, { status: 500 });
  }
}
