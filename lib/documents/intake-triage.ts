import { getSupabaseServerClient } from '@/lib/supabase-server';
import { classifyDocumentIntakeFile } from '@/lib/documents/intake-triage-policy.mjs';

const DEFAULT_BATCH = 100;
const MAX_BATCH = 100;

export type IntakeTriageSummary = {
  examined: number;
  readyForExtraction: number;
  rejectedNonSource: number;
  quarantined: number;
  metadataOnly: number;
  reviewRequired: number;
  failed: number;
};

export async function triageDocumentIntakeBatch(limit = DEFAULT_BATCH): Promise<IntakeTriageSummary> {
  const db = getSupabaseServerClient();
  const bounded = Math.max(1, Math.min(MAX_BATCH, Math.floor(Number(limit) || DEFAULT_BATCH)));

  const { data: items, error } = await db
    .from('document_intake_triage_queue_v1')
    .select('id,organization_id,original_name,mime_type,file_size_bytes,sha256,source,area,source_path,metadata,attempt_count,created_at')
    .order('created_at', { ascending: true })
    .limit(bounded);

  if (error) throw new Error(`document_intake_queue_failed:${error.message}`);

  const summary: IntakeTriageSummary = {
    examined: 0,
    readyForExtraction: 0,
    rejectedNonSource: 0,
    quarantined: 0,
    metadataOnly: 0,
    reviewRequired: 0,
    failed: 0,
  };

  for (const item of items || []) {
    summary.examined += 1;
    const triage = classifyDocumentIntakeFile(item.original_name, item.mime_type);
    const now = new Date().toISOString();
    const attemptCount = Number(item.attempt_count || 0) + 1;

    const { error: stateError } = await db
      .from('document_intake_processing_state')
      .upsert({
        organization_id: item.organization_id,
        intake_item_id: item.id,
        triage_policy: triage.policy,
        processing_state: triage.state,
        reason_code: triage.reason,
        attempt_count: attemptCount,
        triaged_at: now,
        last_error: null,
        metadata: {
          passive_only: true,
          source: item.source || null,
          area: item.area || null,
          source_path: item.source_path || null,
          file_size_bytes: item.file_size_bytes || null,
          sha256: item.sha256 || null,
        },
        updated_at: now,
      }, { onConflict: 'organization_id,intake_item_id' });

    if (stateError) {
      summary.failed += 1;
      console.error('[document-intake-triage] state write failed', item.id, stateError.message);
      continue;
    }

    if (triage.state === 'rejected_non_source' || triage.state === 'quarantined' || triage.state === 'metadata_only') {
      const nextStatus = triage.state === 'metadata_only' ? 'classified' : 'rejected';
      const metadata = {
        ...(item.metadata || {}),
        intake_triage: {
          policy: triage.policy,
          state: triage.state,
          reason: triage.reason,
          triaged_at: now,
          passive_only: true,
        },
      };
      const { error: itemError } = await db
        .from('document_intake_items')
        .update({
          status: nextStatus,
          classified_at: now,
          metadata,
        })
        .eq('organization_id', item.organization_id)
        .eq('id', item.id)
        .eq('status', 'pending_classification');

      if (itemError) {
        summary.failed += 1;
        await db
          .from('document_intake_processing_state')
          .update({
            processing_state: 'failed',
            last_error: 'intake_status_update_failed',
            updated_at: now,
          })
          .eq('organization_id', item.organization_id)
          .eq('intake_item_id', item.id);
        console.error('[document-intake-triage] intake update failed', item.id, itemError.message);
        continue;
      }
    }

    if (triage.state === 'ready_for_extraction') summary.readyForExtraction += 1;
    else if (triage.state === 'rejected_non_source') summary.rejectedNonSource += 1;
    else if (triage.state === 'quarantined') summary.quarantined += 1;
    else if (triage.state === 'metadata_only') summary.metadataOnly += 1;
    else if (triage.state === 'review_required') summary.reviewRequired += 1;
  }

  return summary;
}
