export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getOrganizationContext } from '@/lib/api/organization-context';
import { MODULE_KEYS, requireModuleAccess } from '@/lib/api/module-access';

function textValue(value: unknown) {
  const valueText = String(value ?? '').trim();
  return valueText || null;
}

function numberValue(value: unknown) {
  if (value === null || value === undefined || value === '') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function priorityRank(priority: unknown) {
  const value = String(priority ?? '').toUpperCase();
  if (value.startsWith('P1')) return 1;
  if (value.startsWith('P2')) return 2;
  if (value.startsWith('P3')) return 3;
  if (value.startsWith('P4')) return 4;
  return 9;
}

export async function GET(request: NextRequest) {
  const access = await requireModuleAccess(request, MODULE_KEYS.MANT_OPERACIONES);
  if (!access.authorized) return access.response;

  const context = await getOrganizationContext(request);
  if (!context.ok) return context.response;

  try {
    const [masterResult, pendingEmailResult, sourceResult, whatsappResult] = await Promise.all([
      context.supabase
        .from('motil_maintenance_live_master_v1')
        .select('*')
        .eq('organization_id', context.organizationId)
        .order('latest_signal_at', { ascending: false, nullsFirst: false })
        .limit(5000),
      context.supabase
        .from('motil_email_equipment_meter_stage')
        .select('id,report_date,asset_name_raw,mine_name,reported_equipment_status,reported_issue,reported_work,parts_requested,review_status,source_manifest_id')
        .eq('organization_id', context.organizationId)
        .is('candidate_asset_id', null)
        .order('report_date', { ascending: false })
        .limit(1000),
      context.supabase
        .from('motil_email_source_manifest')
        .select('email_sent_at,email_sender,email_subject,filename,ingest_state,domain')
        .eq('organization_id', context.organizationId)
        .order('email_sent_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
      context.supabase
        .from('motil_whatsapp_messages')
        .select('occurred_at')
        .eq('organization_id', context.organizationId)
        .order('occurred_at', { ascending: false, nullsFirst: false })
        .limit(1)
        .maybeSingle(),
    ]);

    const error = masterResult.error || pendingEmailResult.error || sourceResult.error || whatsappResult.error;
    if (error) throw error;

    const rows = (masterResult.data || []).map((row: any) => ({
      canonicalAssetId: row.canonical_asset_id,
      assetCode: textValue(row.asset_code),
      assetName: textValue(row.asset_name) || 'Equipo sin nombre',
      site: textValue(row.site) || 'Sin faena',
      canonicalStatus: textValue(row.canonical_status),
      canonicalStatusReason: textValue(row.canonical_status_reason),
      canonicalStatusChangedAt: textValue(row.canonical_status_changed_at),

      planningPriority: textValue(row.planning_priority),
      priorityRank: priorityRank(row.planning_priority),
      planningMeterUnit: textValue(row.planning_meter_unit),
      planningCurrentReading: numberValue(row.planning_current_reading),
      planningNextDueMeter: numberValue(row.planning_next_due_meter),
      planningRemainingMeter: numberValue(row.planning_remaining_meter),
      recommendedAction: textValue(row.recommended_action),
      planningScheduledDate: textValue(row.planning_scheduled_date),
      programmingStatus: textValue(row.programming_status_raw),
      responsible: textValue(row.responsible_raw),
      partsStatus: textValue(row.parts_status_raw),
      planningObservations: textValue(row.planning_observations),
      planningSourceFile: textValue(row.planning_source_file),
      planningImportedAt: textValue(row.planning_imported_at),

      emailReportDate: textValue(row.email_report_date),
      emailSentAt: textValue(row.email_sent_at),
      emailSubject: textValue(row.email_subject),
      emailFilename: textValue(row.email_filename),
      emailMeterUnit: textValue(row.email_meter_unit),
      emailMeterValue: numberValue(row.email_meter_value),
      emailReportedMpStatus: textValue(row.reported_mp_status),
      emailReportedStatus: textValue(row.reported_equipment_status),
      emailIssue: textValue(row.reported_issue),
      emailWork: textValue(row.reported_work),
      emailPartsRequested: textValue(row.parts_requested),
      emailReviewStatus: textValue(row.email_review_status),

      whatsappOccurredAt: textValue(row.whatsapp_occurred_at),
      whatsappGroup: textValue(row.whatsapp_group),
      whatsappSender: textValue(row.whatsapp_sender_name),
      whatsappDescription: textValue(row.whatsapp_description),
      whatsappEventClass: textValue(row.whatsapp_event_class),

      openWorkOrders: Number(row.open_work_orders || 0),
      nextWorkOrderDate: textValue(row.next_work_order_date),
      latestSignalAt: textValue(row.latest_signal_at),
      latestSignalSource: textValue(row.latest_signal_source),
    }));

    rows.sort((a, b) => {
      const aAttention = (a.openWorkOrders > 0 ? 100 : 0) + (a.priorityRank === 1 ? 50 : a.priorityRank === 2 ? 25 : 0);
      const bAttention = (b.openWorkOrders > 0 ? 100 : 0) + (b.priorityRank === 1 ? 50 : b.priorityRank === 2 ? 25 : 0);
      if (aAttention !== bAttention) return bAttention - aAttention;
      return String(b.latestSignalAt || '').localeCompare(String(a.latestSignalAt || ''));
    });

    const p1 = rows.filter((row) => row.priorityRank === 1).length;
    const p2 = rows.filter((row) => row.priorityRank === 2).length;
    const openWorkOrders = rows.reduce((sum, row) => sum + row.openWorkOrders, 0);
    const withRecentEmail = rows.filter((row) => row.emailSentAt).length;
    const withWhatsApp = rows.filter((row) => row.whatsappOccurredAt).length;
    const pendingEmail = pendingEmailResult.data || [];

    return NextResponse.json({
      generatedAt: new Date().toISOString(),
      refreshSeconds: 60,
      mode: 'read_only',
      summary: {
        activeAssets: rows.length,
        p1,
        p2,
        urgent: p1 + p2,
        openWorkOrders,
        linkedEmailAssets: withRecentEmail,
        linkedWhatsAppAssets: withWhatsApp,
        pendingEmailMatches: pendingEmail.length,
      },
      freshness: {
        latestEmailAt: textValue(sourceResult.data?.email_sent_at),
        latestEmailSubject: textValue(sourceResult.data?.email_subject),
        latestEmailFilename: textValue(sourceResult.data?.filename),
        latestWhatsAppAt: textValue(whatsappResult.data?.occurred_at),
      },
      pendingEmail: pendingEmail.slice(0, 30).map((row: any) => ({
        id: row.id,
        reportDate: textValue(row.report_date),
        assetNameRaw: textValue(row.asset_name_raw),
        site: textValue(row.mine_name),
        reportedStatus: textValue(row.reported_equipment_status),
        issue: textValue(row.reported_issue),
        work: textValue(row.reported_work),
        partsRequested: textValue(row.parts_requested),
        reviewStatus: textValue(row.review_status),
      })),
      rows,
    }, {
      headers: { 'Cache-Control': 'no-store, max-age=0' },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'No se pudo cargar la Torre de Control' },
      { status: 500 },
    );
  }
}
