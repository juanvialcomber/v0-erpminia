export type WorkOrderScopeViolation =
  | 'GENERAL_WITH_ASSET'
  | 'GENERAL_NOT_CONFIRMED'
  | 'ASSET_REQUIRED'
  | null;

export function workOrderScopeViolation(input: {
  canonicalAssetId?: string | null;
  isGeneralWork: boolean;
  generalWorkConfirmed: boolean;
}): WorkOrderScopeViolation;
