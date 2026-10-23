import {
  normalizeCode,
  normalizeRut,
  type ExternalRecordEnvelope,
  reconciliationKey,
} from './model';

export type Candidate = {
  id: string;
  code?: string | null;
  taxId?: string | null;
};

export type ReconciliationDecision =
  | { status: 'matched'; canonicalId: string; method: 'exact_code' | 'exact_tax_id'; confidence: 1 }
  | { status: 'new_candidate'; key: string | null; confidence: null }
  | { status: 'conflict'; key: string; candidateIds: string[]; confidence: null };

function candidateKey(record: ExternalRecordEnvelope, candidate: Candidate) {
  return record.entityType === 'supplier'
    ? normalizeRut(candidate.taxId)
    : normalizeCode(candidate.code);
}

export function reconcileDeterministically(
  record: ExternalRecordEnvelope,
  candidates: Candidate[],
): ReconciliationDecision {
  const key = reconciliationKey(record);
  if (!key) return { status: 'new_candidate', key: null, confidence: null };

  const matches = candidates.filter((candidate) => candidateKey(record, candidate) === key);

  if (matches.length === 1) {
    return {
      status: 'matched',
      canonicalId: matches[0].id,
      method: record.entityType === 'supplier' ? 'exact_tax_id' : 'exact_code',
      confidence: 1,
    };
  }

  if (matches.length > 1) {
    return { status: 'conflict', key, candidateIds: matches.map((m) => m.id), confidence: null };
  }

  return { status: 'new_candidate', key, confidence: null };
}
