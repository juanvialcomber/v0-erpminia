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

  const [sourcesResult, itemsResult, officialMasterResult] = await Promise.all([
    context.supabase.from('planning_weekly_work_sources')
      .select('id,mine,source_file,source_sha256,source_sheet,week_start,week_end,reported_at,is_current,source_url')
      .eq('organization_id',context.organizationId).eq('is_current',true)
      .order('mine',{ascending:true}).limit(20),
    context.supabase.from('planning_weekly_work_items')
      .select('id,source_id,source_row,planned_date,assigned_name,asset_label,canonical_asset_id,title,work_type_raw,priority_raw,planned_hours,reported_hours,source_status,source_progress,reconciliation_status,review_reason,linked_work_order_id,observations,materials')
      .eq('organization_id',context.organizationId).order('planned_date',{ascending:true}).limit(250),
    context.supabase.from('planning_maintenance_source_rows')
      .select('source_row,mine_raw,asset_name_raw,workbook_priority_raw,reconciliation_status,canonical_asset_id,planning_maintenance_source_imports!inner(source_file,status)')
      .eq('organization_id',context.organizationId)
      .eq('planning_maintenance_source_imports.source_file','Report Maestro Oficial.xlsx')
      .in('workbook_priority_raw',['P1 - VENCIDO','P2 - INMEDIATO'])
      .limit(75),
  ]);
  if(sourcesResult.error || itemsResult.error || officialMasterResult.error){
    return NextResponse.json({error:'No se pudieron cargar los programas oficiales de Ariel.'},{status:500});
  }
  const sources = sourcesResult.data || [];
  const currentIds = new Set(sources.map(source=>source.id));
  const items = (itemsResult.data||[]).filter(item=>currentIds.has(item.source_id));
  const priorityRows=(officialMasterResult.data||[]).map(row=>({
    sourceRow:row.source_row,
    mine:row.mine_raw,
    assetName:row.asset_name_raw,
    priority:row.workbook_priority_raw,
    matched:row.reconciliation_status==='matched' && Boolean(row.canonical_asset_id),
  }));
  return NextResponse.json({
    sources,items,
    officialMaster:{
      source:'Report Maestro Oficial.xlsx',
      p1:priorityRows.filter(r=>r.priority==='P1 - VENCIDO').length,
      p2:priorityRows.filter(r=>r.priority==='P2 - INMEDIATO').length,
      pending:priorityRows.filter(r=>!r.matched),
    },
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
