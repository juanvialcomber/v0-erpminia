import { createHash } from 'node:crypto';

export const PORTERO_STATES = new Set(['ready', 'processing', 'retry_scheduled', 'processed', 'duplicate', 'human_review', 'blocked']);
export const PORTERO_SECTIONS = new Set(['maintenance', 'production', 'finance', 'hse', 'data_health']);
const CLOSED = new Set(['processed', 'duplicate', 'human_review', 'blocked']);

// Metadata is an audit of automatic work, never operational approval.
export function planPorteroHandover(input, previous = null, now = new Date().toISOString()) {
  if (!PORTERO_STATES.has(input.work_state) || !PORTERO_SECTIONS.has(input.section)) throw new Error('invalid_portero_state');
  if (!input.source_identity || !input.scope || !input.owner_name || !input.next_action || !input.reopen_when) throw new Error('incomplete_handover');
  if (input.work_state === 'processed' && (!input.original_verified || !input.extraction_verified)) throw new Error('unverified_completion');
  if (input.work_state === 'human_review' && !input.original_verified && !input.body_source_verified) throw new Error('missing_review_evidence');
  if (input.work_state === 'retry_scheduled' && (!input.next_attempt_at || !Number.isFinite(input.attempts_left) || input.attempts_left < 1)) throw new Error('invalid_retry');
  const material = {
    version: 1, source_identity: input.source_identity, source_version: input.source_version || null,
    section: input.section, owner_profile_id: input.owner_profile_id || null, owner_name: input.owner_name,
    work_state: input.work_state, reason: input.reason || null, next_action: input.next_action,
    reopen_when: input.reopen_when, scope: input.scope, original_verified: Boolean(input.original_verified),
    extraction_verified: Boolean(input.extraction_verified), body_source_verified: Boolean(input.body_source_verified),
    coverage: input.coverage || 'not_verified', evidence_count: input.evidence_count ?? null,
    source_date: input.source_date || null, next_attempt_at: input.next_attempt_at || null,
    attempts_left: input.attempts_left ?? null, automatic_closed: CLOSED.has(input.work_state),
    canonical_approved: false,
  };
  const fingerprint = createHash('sha256').update(JSON.stringify(material)).digest('hex');
  if (previous?.fingerprint === fingerprint) return { changed: false, handover: previous };
  return { changed: true, handover: {
    ...material, fingerprint, prepared_at: now,
    previous_fingerprint: previous?.fingerprint || null,
    // Preparation is not receipt by a person or delivery of a notification.
    receipt_status: 'not_acknowledged', notification_status: 'not_sent',
  } };
}

export function summarizePortero(rows, now = Date.now()) {
  const summary = { readyNow: 0, processing: 0, deferred: 0, humanReview: 0, blocked: 0, completed: 0, unclassified: 0 };
  for (const row of rows) {
    const state = row.work_state;
    if (state === 'ready') summary.readyNow++;
    else if (state === 'processing') summary.processing++;
    else if (state === 'retry_scheduled') {
      const retryAt = Date.parse(row.next_attempt_at || '');
      if (!Number.isFinite(retryAt)) summary.unclassified++;
      else if (retryAt <= now) summary.readyNow++;
      else summary.deferred++;
    }
    else if (state === 'human_review') summary.humanReview++;
    else if (state === 'blocked') summary.blocked++;
    else if (state === 'processed' || state === 'duplicate') summary.completed++;
    else summary.unclassified++;
  }
  return { ...summary, automaticOpen: summary.readyNow + summary.processing + summary.deferred,
    automaticEmpty: summary.readyNow + summary.processing + summary.deferred + summary.unclassified === 0 };
}
