export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

// One official weekly source per mine. Source evidence does not authorize OT creation.
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const [sourcesResult, itemsResult] = await Promise.all([
    context.supabase.from('planning_weekly_work_sources')
      .select('id,mine,source_file,source_sha256,source_sheet,week_start,week_end,reported_at,is_current,source_url')
      .eq('organization_id',context.organizationId).eq('is_current',true)
      .order('mine',{ascending:true}).limit(20),
    context.supabase.from('planning_weekly_work_items')
      .select('id,source_id,source_row,planned_date,assigned_name,asset_label,canonical_asset_id,title,work_type_raw,priority_raw,planned_hours,reported_hours,source_status,source_progress,reconciliation_status,review_reason,linked_work_order_id,observations,materials')
      .eq('organization_id',context.organizationId).order('planned_date',{ascending:true}).limit(250),
  ]);
  if(sourcesResult.error || itemsResult.error){
    return NextResponse.json({error:'No se pudieron cargar los programas oficiales de Ariel.'},{status:500});
  }
  const sources = sourcesResult.data || [];
  const currentIds = new Set(sources.map(source=>source.id));
  const items = (itemsResult.data||[]).filter(item=>currentIds.has(item.source_id));
  return NextResponse.json({
    sources,items,
    summary:{
      total:items.length,
      review:items.filter(item=>item.reconciliation_status!=='matched').length,
      completedReported:items.filter(item=>item.source_status==='Terminado').length,
      linkedOrders:items.filter(item=>Boolean(item.linked_work_order_id)).length,
      plannedHours:items.reduce((sum,item)=>sum+Number(item.planned_hours||0),0),
    },
    authority:'Programas semanales enviados por Ariel; estado reportado no equivale a OT completada.',
  });
}
