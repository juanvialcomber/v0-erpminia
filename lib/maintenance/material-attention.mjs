/**
 * Prioritize a human review of material needs without treating an empty
 * requirement as a shortage or an operational closure blocker.
 *
 * @typedef {{id: string, work_order_number: string | null, title: string | null,
 * priority: string | null, status: string | null, scheduled_date: string | null}} ActiveOrder
 * @param {ActiveOrder[]} orders
 * @param {Set<string>} registeredOrderIds
 * @param {number} [limit]
 */
export function summarizeMaterialAttention(orders, registeredOrderIds, limit = 5) {
  const priorityRank = {
    critical: 0, urgent: 0, emergency: 0,
    high: 1, medium: 2, normal: 2, low: 3,
  };
  const without = orders.filter((order) => !registeredOrderIds.has(order.id));
  without.sort((a, b) => {
    const aPriority = priorityRank[/** @type {keyof typeof priorityRank} */ (String(a.priority || '').toLowerCase())] ?? 4;
    const bPriority = priorityRank[/** @type {keyof typeof priorityRank} */ (String(b.priority || '').toLowerCase())] ?? 4;
    if (aPriority !== bPriority) return aPriority - bPriority;
    const aDate = String(a.scheduled_date || '9999');
    const bDate = String(b.scheduled_date || '9999');
    return aDate.localeCompare(bDate)
      || String(a.work_order_number || a.id).localeCompare(String(b.work_order_number || b.id));
  });
  return {
    activeOrdersReviewed: orders.length,
    requirementsRegisteredOrders: orders.length - without.length,
    withoutRegisteredRequirements: without.length,
    reviewCandidates: without.slice(0, limit).map((order) => ({
      workOrderId: order.id,
      workOrderNumber: order.work_order_number,
      title: order.title,
      priority: order.priority,
      status: order.status,
      scheduledDate: order.scheduled_date,
    })),
  };
}
