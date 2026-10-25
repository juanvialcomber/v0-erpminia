import { daysUntilWorkOrderDate, formatWorkOrderDate, normalizeWorkOrderDateKey } from './work-order-calendar-date.mjs';

// Derive the execution queue from real, assigned work orders. Never duplicate OT state.
const TERMINAL = new Set(['completed', 'closed', 'cancelled', 'canceled']);
const PRIORITY_RANK = { critical: 0, high: 1, medium: 2, low: 3 };
const PRIORITY_LABEL = { critical: 'Crítica', high: 'Alta', medium: 'Media', low: 'Baja' };

function normalizePriority(value) {
  const text = String(value || 'medium').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
  if (text === 'critical' || text === 'critica' || text === 'urgente') return 'critical';
  if (text === 'high' || text === 'alta') return 'high';
  if (text === 'low' || text === 'baja') return 'low';
  return 'medium';
}

export function buildAssignedWorkActions(rows, today) {
  return (rows || [])
    .filter((row) => row?.id && !TERMINAL.has(String(row.status || '').toLowerCase()))
    .map((row) => {
      const priority = normalizePriority(row.priority);
      const scheduledDate = normalizeWorkOrderDateKey(row.scheduled_date);
      const daysUntil = scheduledDate ? daysUntilWorkOrderDate(scheduledDate, today) : null;
      const timerStatus = String(row.timer_status || 'idle').toLowerCase();
      const status = String(row.status || 'open').toLowerCase();
      const number = row.work_order_number || 'OT';
      return {
        id: String(row.id),
        workOrderNumber: number,
        title: number,
        description: row.title || 'Orden de trabajo asignada',
        evidence: (scheduledDate ? 'Programada: ' + formatWorkOrderDate(scheduledDate) : 'Sin fecha programada') + ' · Prioridad ' + PRIORITY_LABEL[priority],
        href: '/dashboard/mantenimiento/ordenes-trabajo/' + encodeURIComponent(String(row.id)),
        priority,
        priorityLabel: PRIORITY_LABEL[priority],
        scheduledDate,
        daysUntil,
        status,
        timerStatus,
        isCritical: priority === 'critical',
        isOverdue: daysUntil != null && daysUntil < 0,
        isRunning: timerStatus === 'running',
        isPaused: timerStatus === 'paused',
        createdAt: String(row.created_at || ''),
      };
    })
    .sort((a, b) => {
      const rank = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
      if (rank) return rank;
      if (a.isRunning !== b.isRunning) return a.isRunning ? -1 : 1;
      const aDay = a.scheduledDate || '9999-12-31';
      const bDay = b.scheduledDate || '9999-12-31';
      return aDay.localeCompare(bDay) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
    })
    .map(({ createdAt, ...action }) => action);
}
