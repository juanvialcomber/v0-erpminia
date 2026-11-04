export function workOrderScopeViolation({ canonicalAssetId, isGeneralWork, generalWorkConfirmed }) {
  if (isGeneralWork && canonicalAssetId) return 'GENERAL_WITH_ASSET';
  if (isGeneralWork && generalWorkConfirmed !== true) return 'GENERAL_NOT_CONFIRMED';
  if (!isGeneralWork && !canonicalAssetId) return 'ASSET_REQUIRED';
  return null;
}
