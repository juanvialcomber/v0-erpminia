import type { MotilSkillRisk } from './catalog';

export type SkillActionType =
  | 'explain'
  | 'compare'
  | 'prioritize'
  | 'open_evidence'
  | 'propose_review'
  | 'draft_purchase_request'
  | 'propose_stock_transfer'
  | 'propose_data_correction'
  | 'approve_purchase'
  | 'execute_payment'
  | 'execute_stock_transfer'
  | 'close_work_order'
  | 'apply_canonical_correction';

export type SkillActionPolicy = {
  allowed: boolean;
  requiresHumanConfirmation: boolean;
  requiresWritePermission: boolean;
  reason: string;
};

const SAFE_READ_ACTIONS = new Set<SkillActionType>([
  'explain',
  'compare',
  'prioritize',
  'open_evidence',
]);

const PROPOSAL_ACTIONS = new Set<SkillActionType>([
  'propose_review',
  'draft_purchase_request',
  'propose_stock_transfer',
  'propose_data_correction',
]);

const EXECUTION_ACTIONS = new Set<SkillActionType>([
  'approve_purchase',
  'execute_payment',
  'execute_stock_transfer',
  'close_work_order',
  'apply_canonical_correction',
]);

export function skillActionPolicy(
  action: SkillActionType,
  risk: MotilSkillRisk,
): SkillActionPolicy {
  if (SAFE_READ_ACTIONS.has(action)) {
    return {
      allowed: true,
      requiresHumanConfirmation: false,
      requiresWritePermission: false,
      reason: 'Read-only grounded assistance.',
    };
  }

  if (PROPOSAL_ACTIONS.has(action)) {
    return {
      allowed: risk !== 'read_only' || action === 'propose_review',
      requiresHumanConfirmation: true,
      requiresWritePermission: false,
      reason: 'MOTIL may prepare a proposal but a human owns the operational decision.',
    };
  }

  if (EXECUTION_ACTIONS.has(action)) {
    return {
      allowed: false,
      requiresHumanConfirmation: true,
      requiresWritePermission: true,
      reason: 'Operational or financial execution is never an autonomous skill action.',
    };
  }

  return {
    allowed: false,
    requiresHumanConfirmation: true,
    requiresWritePermission: true,
    reason: 'Unknown action fails closed.',
  };
}
