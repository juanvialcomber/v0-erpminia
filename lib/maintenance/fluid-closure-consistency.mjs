/**
 * Confirms that a mechanic's last declaration still describes the recorded fluid use.
 * Material/stock reconciliation is intentionally out of scope.
 *
 * @param {{actor_id?: string | null, event_at?: string | null, payload?: unknown} | null | undefined} declaration
 * @param {string | null | undefined} assignedProfileId
 * @param {Array<{created_at?: string | null, updated_at?: string | null}>} usages
 */
export function isFluidClosureDeclarationCurrent(declaration, assignedProfileId, usages) {
  if (!declaration || !assignedProfileId || declaration.actor_id !== assignedProfileId || !Array.isArray(usages)) return false;
  const payload = declaration.payload && typeof declaration.payload === 'object' && !Array.isArray(declaration.payload)
    ? /** @type {Record<string, unknown>} */ (declaration.payload)
    : null;
  if (!payload || payload.declared_by_assigned_executor !== true || typeof payload.fluids_used !== 'boolean') return false;
  const declaredCount = payload.fluid_usage_count;
  if (typeof declaredCount !== 'number' || !Number.isInteger(declaredCount) || declaredCount < 0 || declaredCount !== usages.length) return false;
  if (payload.fluids_used !== (usages.length > 0)) return false;
  const declaredAt = Date.parse(declaration.event_at || '');
  if (!Number.isFinite(declaredAt)) return false;
  return usages.every((usage) => {
    const registeredAt = Date.parse(usage.created_at || '');
    const updatedAt = Date.parse(usage.updated_at || usage.created_at || '');
    return Number.isFinite(registeredAt) && Number.isFinite(updatedAt)
      && registeredAt <= declaredAt && updatedAt <= declaredAt;
  });
}
