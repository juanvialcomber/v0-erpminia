/**
 * Confirms that a mechanic's last declaration still describes the recorded fluid use.
 * Material/stock reconciliation is intentionally out of scope.
 *
 * @param {{actor_id?: string | null, event_at?: string | null, payload?: Record<string, unknown> | null} | null | undefined} declaration
 * @param {string | null | undefined} assignedProfileId
 * @param {Array<{created_at?: string | null}>} usages
 */
export function isFluidClosureDeclarationCurrent(declaration, assignedProfileId, usages) {
  if (!declaration || !assignedProfileId || declaration.actor_id !== assignedProfileId || !Array.isArray(usages)) return false;
  const payload = declaration.payload;
  if (!payload || payload.declared_by_assigned_executor !== true || typeof payload.fluids_used !== 'boolean') return false;
  const declaredCount = payload.fluid_usage_count;
  if (!Number.isInteger(declaredCount) || declaredCount < 0 || declaredCount !== usages.length) return false;
  if (payload.fluids_used !== (usages.length > 0)) return false;
  const declaredAt = Date.parse(declaration.event_at || '');
  if (!Number.isFinite(declaredAt)) return false;
  return usages.every((usage) => {
    const registeredAt = Date.parse(usage.created_at || '');
    return Number.isFinite(registeredAt) && registeredAt <= declaredAt;
  });
}
