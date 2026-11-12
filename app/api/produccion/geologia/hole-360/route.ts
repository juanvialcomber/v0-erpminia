export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Read-only, tenant-scoped detail for one canonical drill hole.
 * Source reports are observations, not validated geological logging.
 */
export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.PROD_GEOLOGIA);
  if (!access.authorized) return access.response;
  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  const holeId = request.nextUrl.searchParams.get('holeId');
  if (!holeId || !UUID.test(holeId)) {
    return NextResponse.json({ error: 'Identificador de sondaje inválido' }, { status: 400 });
  }

  const hole = await context.supabase
    .from('production_drill_holes')
    .select('id,hole_code,status,start_at,completed_at,drilled_depth_m,planned_depth_m,source_type,source_reference')
    .eq('organization_id', context.organizationId)
    .eq('id', holeId)
    .maybeSingle();

  if (hole.error) return NextResponse.json({ error: hole.error.message }, { status: 500 });
  if (!hole.data) return NextResponse.json({ error: 'Sondaje no encontrado' }, { status: 404 });

  const [profile, tasks, reports, samples] = await Promise.all([
    context.supabase.from('production_geology_hole_profile_v1')
      .select('drill_hole_id,hole_code,mine_name,sector_name,orientation_confidence,raw_inclination_conflict,deterministic_gap_count,geology_priority_rank,recommended_action,source_reference,interval_count,mineralization_interval_count,structural_interval_count,operational_geology_evidence_count,visual_mineral_evidence_count,structural_evidence_count,lithology_evidence_count,recovery_evidence_count,topography_evidence_count,survey_evidence_count')
      .eq('organization_id', context.organizationId).eq('drill_hole_id', holeId).maybeSingle(),
    context.supabase.from('production_geology_immediate_tasks_2026_v1')
      .select('drill_hole_id,task_priority,task_category,task_title,clarifying_question,recommended_action,required_source_action,human_checkpoint,evidence_summary,first_evidence_date,last_evidence_date')
      .eq('organization_id', context.organizationId).eq('drill_hole_id', holeId).eq('is_immediate', true)
      .order('task_priority', { ascending: true }).limit(10),
    context.supabase.from('production_drilling_source_reports')
      .select('id,operation_date,source_file,source_sheet,source_row,meter_initial,meter_final,drilled_meters,drilling_observations,reconciliation_status')
      .eq('organization_id', context.organizationId).eq('canonical_drill_hole_id', holeId)
      .order('operation_date', { ascending: false }).order('source_row', { ascending: false }).limit(8),
    context.supabase.from('production_chemistry_samples')
      .select('id,sample_code,sample_date,depth_from_m,depth_to_m,validation_status,source_file')
      .eq('organization_id', context.organizationId).eq('drill_hole_id', holeId)
      .order('sample_date', { ascending: false }).limit(25),
  ]);

  const queryError = profile.error || tasks.error || reports.error || samples.error;
  if (queryError) return NextResponse.json({ error: queryError.message }, { status: 500 });

  const sampleRows = samples.data || [];
  const sampleIds = sampleRows.map((row) => row.id);
  const assays = sampleIds.length
    ? await context.supabase.from('production_chemistry_results')
        .select('sample_id,analyte_code,result_value,result_unit,validation_status,result_date,laboratory,source_file')
        .eq('organization_id', context.organizationId).in('sample_id', sampleIds)
        .order('result_date', { ascending: false }).limit(50)
    : { data: [], error: null };

  if (assays.error) return NextResponse.json({ error: assays.error.message }, { status: 500 });

  return NextResponse.json({
    hole: hole.data,
    profile: profile.data || null,
    immediateTasks: tasks.data || [],
    recentSourceReports: reports.data || [],
    latestSourceDate: reports.data?.[0]?.operation_date || null,
    linkedSamples: sampleRows,
    linkedAssays: assays.data || [],
    boundaries: {
      sourceReportsAreFormalLogging: false,
      visualMineralizationIsAssay: false,
      missingDataIsAutomaticTask: false,
    },
  }, { headers: { 'Cache-Control': 'private, no-store' } });
}
