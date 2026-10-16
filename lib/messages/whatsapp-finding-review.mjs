// WhatsApp messages are external evidence, not MOTIL operational truth.
// This module only supports explicit human review; it never mutates an OT.
export const FINDING_DECISIONS = ['confirmed', 'needs_more_info', 'dismissed'];

export function sourceIdsOfFinding(finding, limit = 20) {
  if (!finding || typeof finding !== 'object' || !Array.isArray(finding.source_ids)) return [];
  const ids = finding.source_ids.filter(id => Number.isSafeInteger(id) && id > 0);
  return [...new Set(ids)].slice(0, limit);
}

export function canReviewFinding(finding, decision) {
  if (!finding || typeof finding !== 'object' || !FINDING_DECISIONS.includes(decision)) return false;
  const current = finding.review_status || 'pending';
  return current === 'pending' || (current === 'needs_more_info' && decision !== 'needs_more_info');
}

export function reviewedFinding(finding, decision, note, actor, reviewedAt) {
  if (!canReviewFinding(finding, decision)) throw new Error('finding_review_locked');
  if (typeof note !== 'string' || note.trim().length < 8 || note.trim().length > 500) {
    throw new Error('review_note_required');
  }
  if (!actor || typeof actor !== 'string' || !reviewedAt || !Number.isFinite(Date.parse(reviewedAt))) {
    throw new Error('review_identity_invalid');
  }
  const history = Array.isArray(finding.review_history) ? finding.review_history : [];
  if (history.length >= 10) throw new Error('review_history_full');
  const event = { decision, note: note.trim(), actor_id: actor, reviewed_at: reviewedAt };
  return {
    ...finding,
    review_status: decision,
    review_note: event.note,
    reviewed_by: actor,
    reviewed_at: reviewedAt,
    review_history: [...history, event],
  };
}


// Operational plant work is not a machine-maintenance work order.
// Deliberately keep plant observations separate from canonical production
// measurements, machine OT lifecycle, HSE, and staff assignments.
export const OPERATIONAL_SCOPES = ['plant', 'dispatch', 'general'];
export const OPERATIONAL_CATEGORIES = [
  'plant_intervention', 'cleaning', 'process_adjustment',
  'process_reading', 'pending_task', 'dispatch_coordination', 'other',
];
export const REPORTED_STATES = ['reported_done', 'pending', 'planned', 'unclear'];

export function canRecordOperationalFinding(finding) {
  return Boolean(finding && typeof finding.detail === 'string' &&
    finding.detail.trim().length > 0 && finding.review_status === 'confirmed' &&
    sourceIdsOfFinding(finding).length > 0 && !finding.operational_log_id);
}

export function validOperationalClassification(scope, category, reportedState) {
  if (!OPERATIONAL_SCOPES.includes(scope) ||
      !OPERATIONAL_CATEGORIES.includes(category) ||
      !REPORTED_STATES.includes(reportedState)) return false;
  if (category === 'dispatch_coordination' && scope !== 'dispatch') return false;
  if (scope === 'dispatch' && category !== 'dispatch_coordination' && category !== 'other') return false;
  if (scope === 'plant' && category === 'dispatch_coordination') return false;
  return true;
}
